import crypto from 'node:crypto';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import {
  BLUEPRINT_LIMITS,
  normalizeAdminRole,
  type AdminAuditAction,
} from '../src/shared/types.ts';
import {
  getFirebaseAppletConfig,
  initFirebaseAdmin,
  isFirestorePermissionError,
} from './firebaseAdmin.ts';

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES_PER_TARGET = 5;
const LOGIN_MAX_FAILURES_PER_IP = 20;
const RESET_WINDOW_MS = 15 * 60 * 1000;
const RESET_MAX_REQUESTS_PER_IP = 5;
const MIN_AUTH_FAILURE_DELAY_MS = 200;

interface RateLimitRecord {
  count: number;
  windowStartMs: number;
  lockedUntilMs: number;
}

const memoryRateLimits = new Map<string, RateLimitRecord>();

export interface AuthVerifyResult {
  ok: boolean;
  mfaRequired?: boolean;
  localId?: string;
  tooManyAttempts?: boolean;
}

export type PasswordVerifierFn = (
  email: string,
  password: string,
  apiKey: string
) => Promise<AuthVerifyResult>;

export type ResetEmailSenderFn = (email: string, apiKey: string) => Promise<boolean>;

function hashIdentifier(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function sleepMinimum(startedAtMs: number, minDurationMs: number): Promise<void> {
  const elapsed = Date.now() - startedAtMs;
  if (elapsed < minDurationMs) {
    await new Promise((resolve) => setTimeout(resolve, minDurationMs - elapsed));
  }
}

export async function verifyPasswordWithIdentityToolkit(
  email: string,
  password: string,
  apiKey: string
): Promise<AuthVerifyResult> {
  if (!apiKey) {
    throw new Error('Firebase Web API key is unavailable.');
  }

  const endpoint = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      returnSecureToken: false,
    }),
  });

  const data = (await res.json()) as {
    localId?: string;
    error?: { message?: string };
  };

  if (res.ok) {
    return { ok: true, localId: data.localId };
  }

  const msg = data.error?.message || '';
  if (msg === 'MFA_REQUIRED' || msg.includes('MFA_REQUIRED')) {
    return { ok: true, mfaRequired: true };
  }
  if (msg.includes('TOO_MANY_ATTEMPTS_TRY_LATER')) {
    return { ok: false, tooManyAttempts: true };
  }

  return { ok: false };
}

export async function sendResetEmailWithIdentityToolkit(
  email: string,
  apiKey: string
): Promise<boolean> {
  if (!apiKey) return false;

  const endpoint = `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requestType: 'PASSWORD_RESET',
      email,
    }),
  });

  return res.ok;
}

async function isRateLimited(
  db: Firestore | null,
  keyHash: string,
  nowMs: number,
  windowMs: number
): Promise<boolean> {
  const mem = memoryRateLimits.get(keyHash);
  if (mem) {
    if (mem.lockedUntilMs > nowMs) return true;
    if (nowMs - mem.windowStartMs > windowMs) {
      memoryRateLimits.delete(keyHash);
    }
  }

  if (!db) return false;

  try {
    const snap = await db.collection('auth_rate_limits').doc(keyHash).get();
    if (!snap.exists) return false;
    const lockedUntilMs = Number(snap.get('lockedUntilMs') ?? 0);
    const windowStartMs = Number(snap.get('windowStartMs') ?? 0);
    if (lockedUntilMs > nowMs) {
      return true;
    }
    if (nowMs - windowStartMs > windowMs) {
      return false;
    }
    return false;
  } catch (err) {
    if (!isFirestorePermissionError(err)) {
      console.warn('Rate limit read skipped due to Firestore error.');
    }
    return false;
  }
}

async function recordRateLimitFailure(
  db: Firestore | null,
  keyHash: string,
  nowMs: number,
  windowMs: number,
  maxAttempts: number
): Promise<{ locked: boolean }> {
  const existingMem = memoryRateLimits.get(keyHash);
  const resetWindow = !existingMem || nowMs - existingMem.windowStartMs > windowMs;
  const nextCount = resetWindow ? 1 : existingMem.count + 1;
  const lockedUntilMs = nextCount >= maxAttempts ? nowMs + windowMs : 0;
  memoryRateLimits.set(keyHash, {
    count: nextCount,
    windowStartMs: resetWindow ? nowMs : existingMem.windowStartMs,
    lockedUntilMs,
  });

  if (!db) {
    return { locked: lockedUntilMs > nowMs };
  }

  try {
    const ref = db.collection('auth_rate_limits').doc(keyHash);
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const prevWindowStart = snap.exists ? Number(snap.get('windowStartMs') ?? 0) : 0;
      const prevCount = snap.exists ? Number(snap.get('count') ?? 0) : 0;
      const expired = !snap.exists || nowMs - prevWindowStart > windowMs;
      const count = expired ? 1 : prevCount + 1;
      const windowStartMs = expired ? nowMs : prevWindowStart;
      const lockedUntil = count >= maxAttempts ? nowMs + windowMs : 0;
      tx.set(ref, {
        count,
        windowStartMs,
        lockedUntilMs: lockedUntil,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return lockedUntil > nowMs;
    });
    return { locked: result };
  } catch {
    return { locked: lockedUntilMs > nowMs };
  }
}

async function clearRateLimit(db: Firestore | null, keyHash: string): Promise<void> {
  memoryRateLimits.delete(keyHash);
  if (!db) return;
  try {
    await db.collection('auth_rate_limits').doc(keyHash).delete();
  } catch {
    // Non-fatal cleanup
  }
}

async function logAuditEvent(
  db: Firestore | null,
  entry: {
    action: AdminAuditAction;
    actorUid: string;
    actorUsername: string;
    actorEmail: string;
    targetId: string;
    details: string;
  }
): Promise<void> {
  if (!db) return;
  try {
    await db.collection('admin_audit_logs').add({
      action: entry.action,
      actorUid: entry.actorUid.slice(0, 128),
      actorUsername: entry.actorUsername.slice(0, 32),
      actorEmail: entry.actorEmail.slice(0, 254),
      targetId: entry.targetId.slice(0, 128),
      details: entry.details.slice(0, 500),
      timestamp: FieldValue.serverTimestamp(),
    });
  } catch {
    // Audit logging must not leak credentials or crash auth responses
  }
}

export function clearInMemoryAuthRateLimitsForTests(): void {
  memoryRateLimits.clear();
}

export async function processAuthLogin(args: {
  body: unknown;
  clientIp?: string;
  verifyPassword?: PasswordVerifierFn;
  firestoreOverride?: Firestore | null;
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const startedAtMs = Date.now();
  const { identifier: rawIdentifier, password: rawPassword } = (args.body ?? {}) as {
    identifier?: unknown;
    password?: unknown;
  };

  if (
    typeof rawIdentifier !== 'string' ||
    typeof rawPassword !== 'string' ||
    !rawIdentifier.trim() ||
    !rawPassword ||
    rawIdentifier.trim().length > 254 ||
    rawPassword.length > 256
  ) {
    return {
      status: 400,
      body: { ok: false, error: 'Username and password are required.' },
    };
  }

  const identifier = rawIdentifier.trim().toLowerCase();
  const password = rawPassword;
  const ip = (args.clientIp || 'unknown').trim();
  const ipKey = hashIdentifier(`login:ip:${ip}`);
  const targetKey = hashIdentifier(`login:target:${ip}:${identifier}`);

  const firestore =
    args.firestoreOverride !== undefined
      ? args.firestoreOverride
      : (() => {
          const { db, adminSdkFirestoreReady } = initFirebaseAdmin();
          return adminSdkFirestoreReady ? db : null;
        })();
  const config = getFirebaseAppletConfig();
  const verifier = args.verifyPassword ?? verifyPasswordWithIdentityToolkit;

  // Enforce rate limit before doing any lookup
  const [ipBlocked, targetBlocked] = await Promise.all([
    isRateLimited(firestore, ipKey, startedAtMs, LOGIN_WINDOW_MS),
    isRateLimited(firestore, targetKey, startedAtMs, LOGIN_WINDOW_MS),
  ]);

  if (ipBlocked || targetBlocked) {
    await logAuditEvent(firestore, {
      action: 'login_rate_limited',
      actorUid: 'anonymous',
      actorUsername: '',
      actorEmail: '',
      targetId: targetKey.slice(0, 24),
      details: 'Sign-in attempt blocked by rate limiter.',
    });
    return {
      status: 429,
      body: {
        ok: false,
        error: 'Too many failed sign-in attempts. Please wait 15 minutes and try again.',
      },
    };
  }

  const isEmailInput = identifier.includes('@');

  // If username is entered without server-side Firestore credentials, fail safely to email fallback
  if (!isEmailInput && !firestore) {
    return {
      status: 400,
      body: {
        ok: false,
        code: 'USERNAME_LOOKUP_UNAVAILABLE',
        error:
          'Server-side username lookup requires FIREBASE_ADMIN_CREDENTIALS_JSON. Please sign in with your administrator email address.',
      },
    };
  }

  let resolvedEmail = '';
  let adminDocSnap: FirebaseFirestore.DocumentSnapshot | null = null;

  if (!isEmailInput && firestore) {
    if (!BLUEPRINT_LIMITS.USERNAME_REGEX.test(identifier)) {
      await recordRateLimitFailure(firestore, ipKey, startedAtMs, LOGIN_WINDOW_MS, LOGIN_MAX_FAILURES_PER_IP);
      await recordRateLimitFailure(firestore, targetKey, startedAtMs, LOGIN_WINDOW_MS, LOGIN_MAX_FAILURES_PER_TARGET);
      await sleepMinimum(startedAtMs, MIN_AUTH_FAILURE_DELAY_MS);
      return {
        status: 401,
        body: { ok: false, error: 'Invalid username or password.' },
      };
    }

    const snap = await firestore
      .collection('admins')
      .where('username', '==', identifier)
      .limit(1)
      .get();

    if (snap.empty) {
      await recordRateLimitFailure(firestore, ipKey, startedAtMs, LOGIN_WINDOW_MS, LOGIN_MAX_FAILURES_PER_IP);
      await recordRateLimitFailure(firestore, targetKey, startedAtMs, LOGIN_WINDOW_MS, LOGIN_MAX_FAILURES_PER_TARGET);
      await logAuditEvent(firestore, {
        action: 'login_failed',
        actorUid: 'anonymous',
        actorUsername: '',
        actorEmail: '',
        targetId: targetKey.slice(0, 24),
        details: 'Failed sign-in attempt (invalid credentials).',
      });
      await sleepMinimum(startedAtMs, MIN_AUTH_FAILURE_DELAY_MS);
      return {
        status: 401,
        body: { ok: false, error: 'Invalid username or password.' },
      };
    }

    adminDocSnap = snap.docs[0];
    resolvedEmail = String(adminDocSnap.get('email') || '').trim().toLowerCase();
  } else {
    resolvedEmail = identifier;
  }

  if (!resolvedEmail || !config.apiKey) {
    await sleepMinimum(startedAtMs, MIN_AUTH_FAILURE_DELAY_MS);
    return {
      status: 503,
      body: { ok: false, error: 'Authentication service is not configured.' },
    };
  }

  // Verify password against Firebase Authentication (Identity Toolkit REST API)
  let verifyResult: AuthVerifyResult;
  try {
    verifyResult = await verifier(resolvedEmail, password, config.apiKey);
  } catch {
    return {
      status: 503,
      body: { ok: false, error: 'Unable to reach Firebase Authentication service.' },
    };
  }

  if (verifyResult.tooManyAttempts) {
    return {
      status: 429,
      body: {
        ok: false,
        error: 'Too many failed sign-in attempts. Please wait 15 minutes and try again.',
      },
    };
  }

  if (!verifyResult.ok) {
    await recordRateLimitFailure(firestore, ipKey, startedAtMs, LOGIN_WINDOW_MS, LOGIN_MAX_FAILURES_PER_IP);
    await recordRateLimitFailure(firestore, targetKey, startedAtMs, LOGIN_WINDOW_MS, LOGIN_MAX_FAILURES_PER_TARGET);
    await logAuditEvent(firestore, {
      action: 'login_failed',
      actorUid: 'anonymous',
      actorUsername: '',
      actorEmail: '',
      targetId: adminDocSnap?.id ?? targetKey.slice(0, 24),
      details: 'Failed sign-in attempt (invalid credentials).',
    });
    await sleepMinimum(startedAtMs, MIN_AUTH_FAILURE_DELAY_MS);
    return {
      status: 401,
      body: { ok: false, error: 'Invalid username or password.' },
    };
  }

  // Password is verified. Now enforce server-side admin allowlist & active check when Firestore Admin is ready.
  if (firestore) {
    if (!adminDocSnap && verifyResult.localId) {
      adminDocSnap = await firestore.collection('admins').doc(verifyResult.localId).get();
    } else if (!adminDocSnap) {
      const byEmail = await firestore
        .collection('admins')
        .where('email', '==', resolvedEmail)
        .limit(1)
        .get();
      adminDocSnap = byEmail.docs[0] ?? null;
    }

    if (!adminDocSnap || !adminDocSnap.exists) {
      await logAuditEvent(firestore, {
        action: 'login_denied_unauthorized',
        actorUid: verifyResult.localId || 'unknown',
        actorUsername: '',
        actorEmail: resolvedEmail,
        targetId: verifyResult.localId || 'unknown',
        details: 'Authenticated user denied: not on administrator allowlist.',
      });
      return {
        status: 403,
        body: { ok: false, error: 'This account is not authorized to access GrievanceFlow.' },
      };
    }

    const active = adminDocSnap.get('active') === true;
    const role = normalizeAdminRole(adminDocSnap.get('role'));
    const username = String(adminDocSnap.get('username') || '');

    if (!active || !role) {
      await logAuditEvent(firestore, {
        action: 'login_denied_disabled',
        actorUid: adminDocSnap.id,
        actorUsername: username,
        actorEmail: resolvedEmail,
        targetId: adminDocSnap.id,
        details: 'Sign-in rejected because administrator account is disabled or role is invalid.',
      });
      return {
        status: 403,
        body: { ok: false, error: 'This administrator account has been disabled.' },
      };
    }

    await clearRateLimit(firestore, targetKey);
    await logAuditEvent(firestore, {
      action: 'login_success',
      actorUid: adminDocSnap.id,
      actorUsername: username,
      actorEmail: resolvedEmail,
      targetId: adminDocSnap.id,
      details: verifyResult.mfaRequired
        ? 'Primary credentials verified; awaiting MFA verification.'
        : 'Administrator signed in via server-verified credentials.',
    });
  } else {
    await clearRateLimit(firestore, targetKey);
  }

  return {
    status: 200,
    body: {
      ok: true,
      mode: 'email_signin',
      email: resolvedEmail,
      mfaRequired: Boolean(verifyResult.mfaRequired),
    },
  };
}

export async function processPasswordResetRequest(args: {
  body: unknown;
  clientIp?: string;
  sendResetEmail?: ResetEmailSenderFn;
  firestoreOverride?: Firestore | null;
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const nowMs = Date.now();
  const { email: rawEmail } = (args.body ?? {}) as { email?: unknown };
  if (typeof rawEmail !== 'string' || !rawEmail.trim() || rawEmail.trim().length > 254) {
    return { status: 400, body: { ok: false, error: 'Please enter a valid administrator email.' } };
  }

  const email = rawEmail.trim().toLowerCase();
  const ip = (args.clientIp || 'unknown').trim();
  const resetKey = hashIdentifier(`reset:${ip}`);

  const firestore =
    args.firestoreOverride !== undefined
      ? args.firestoreOverride
      : (() => {
          const { db, adminSdkFirestoreReady } = initFirebaseAdmin();
          return adminSdkFirestoreReady ? db : null;
        })();
  const config = getFirebaseAppletConfig();

  const { locked } = await recordRateLimitFailure(
    firestore,
    resetKey,
    nowMs,
    RESET_WINDOW_MS,
    RESET_MAX_REQUESTS_PER_IP
  );
  if (locked) {
    return {
      status: 429,
      body: {
        ok: false,
        error: 'Too many password reset requests. Please wait 15 minutes before trying again.',
      },
    };
  }

  const genericMessage =
    'If an active administrator account matches that email, a password reset link has been sent.';

  if (!config.apiKey) {
    return { status: 200, body: { ok: true, message: genericMessage } };
  }

  const sender = args.sendResetEmail ?? sendResetEmailWithIdentityToolkit;

  try {
    if (firestore) {
      const snap = await firestore
        .collection('admins')
        .where('email', '==', email)
        .limit(1)
        .get();
      if (!snap.empty && snap.docs[0].get('active') === true) {
        await sender(email, config.apiKey);
        await logAuditEvent(firestore, {
          action: 'password_reset_requested',
          actorUid: snap.docs[0].id,
          actorUsername: String(snap.docs[0].get('username') || ''),
          actorEmail: email,
          targetId: snap.docs[0].id,
          details: 'Password reset link dispatched to verified administrator email.',
        });
      }
    } else {
      await sender(email, config.apiKey);
    }
  } catch {
    // Always return generic confirmation to prevent enumeration
  }

  return { status: 200, body: { ok: true, message: genericMessage } };
}
