import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  TotpMultiFactorGenerator,
  browserLocalPersistence,
  browserSessionPersistence,
  getMultiFactorResolver,
  multiFactor,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  type MultiFactorResolver,
  type TotpSecret,
  type User,
} from 'firebase/auth';
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { DEMO_ADMIN_USER } from '../data/demoData';
import {
  FIREBASE_PROJECT_ID,
  FIRESTORE_DATABASE_ID,
  OperationType,
  auth,
  db,
  handleFirestoreError,
  testConnection,
} from '../firebase/firebaseClient';
import {
  normalizeAdminRole,
  type AdminAuditAction,
  type AdminUser,
  type IntegrationStatus,
} from '../shared/types';

export type AuthStatus =
  | 'loading'
  | 'unauthenticated'
  | 'unauthorized'
  | 'authenticated'
  | 'demo';

export interface UnauthorizedInfo {
  uid: string;
  email: string;
  reason: 'missing_profile' | 'disabled' | 'permission_denied';
}

interface AuthContextValue {
  status: AuthStatus;
  firebaseUser: User | null;
  adminProfile: AdminUser | null;
  authError: string | null;
  unauthorizedInfo: UnauthorizedInfo | null;
  isDemoMode: boolean;
  integrationStatus: IntegrationStatus;
  mfaChallenge: { active: boolean; hint: string };
  signInWithCredentials: (
    identifier: string,
    password: string,
    rememberSession?: boolean
  ) => Promise<void>;
  verifyMfaCode: (code: string) => Promise<void>;
  cancelMfa: () => void;
  requestPasswordReset: (email: string) => Promise<string>;
  sendVerificationEmail: () => Promise<void>;
  startTotpEnrollment: () => Promise<{ secret: TotpSecret; qrUri: string; manualKey: string }>;
  completeTotpEnrollment: (secret: TotpSecret, code: string, label?: string) => Promise<void>;
  removeMfaFactor: (factorUid: string) => Promise<void>;
  enterDemoMode: () => void;
  exitDemoMode: () => void;
  logout: () => Promise<void>;
  refreshIntegrationStatus: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const DEFAULT_INTEGRATION_STATUS: IntegrationStatus = {
  firebaseConnected: Boolean(FIREBASE_PROJECT_ID),
  firebaseProjectId: FIREBASE_PROJECT_ID,
  whatsappConnected: false,
  webhookConfigured: false,
  verifyTokenConfigured: false,
  appSecretConfigured: false,
  resolutionTemplateConfigured: false,
  usernameLoginReady: false,
  adminSdkFirestoreReady: false,
  adminSdkMode: FIREBASE_PROJECT_ID ? 'id_token_only' : 'unconfigured',
  lastWebhookEventAt: null,
};

async function recordClientAudit(
  action: AdminAuditAction,
  profile: { uid: string; username: string; email: string },
  targetId: string,
  details: string
): Promise<void> {
  try {
    await addDoc(collection(db, 'admin_audit_logs'), {
      action,
      actorUid: profile.uid,
      actorUsername: profile.username.slice(0, 32),
      actorEmail: profile.email.slice(0, 254),
      targetId: targetId.slice(0, 128),
      details: details.slice(0, 500),
      timestamp: serverTimestamp(),
    });
  } catch {
    // Audit write is best-effort for client-initiated security actions
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [adminProfile, setAdminProfile] = useState<AdminUser | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [unauthorizedInfo, setUnauthorizedInfo] = useState<UnauthorizedInfo | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatus>(
    DEFAULT_INTEGRATION_STATUS
  );
  const [mfaChallenge, setMfaChallenge] = useState<{ active: boolean; hint: string }>({
    active: false,
    hint: '',
  });
  const mfaResolverRef = useRef<MultiFactorResolver | null>(null);
  const preserveUnauthorizedRef = useRef(false);

  const refreshIntegrationStatus = useCallback(async () => {
    try {
      const [connResult, apiRes] = await Promise.all([
        testConnection(),
        fetch('/api/health/status').then((r) => (r.ok ? (r.json() as Promise<IntegrationStatus>) : null)),
      ]);
      setIntegrationStatus((prev) => ({
        ...prev,
        ...(apiRes ?? {}),
        firebaseConnected: connResult.reachable && Boolean(FIREBASE_PROJECT_ID),
      }));
    } catch {
      // Keep safe defaults if server is restarting
    }
  }, []);

  useEffect(() => {
    void refreshIntegrationStatus();
  }, [refreshIntegrationStatus]);

  useEffect(() => {
    let unsubAdminDoc: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      unsubAdminDoc?.();
      unsubAdminDoc = undefined;

      if (isDemoMode) {
        return;
      }

      if (!user) {
        setFirebaseUser(null);
        setAdminProfile(null);
        if (preserveUnauthorizedRef.current) {
          preserveUnauthorizedRef.current = false;
          return;
        }
        setStatus('unauthenticated');
        return;
      }

      setFirebaseUser(user);
      setAuthError(null);
      setUnauthorizedInfo(null);

      // Subscribe in real time to admins/{uid} so disabling an account immediately revokes access
      const adminRef = doc(db, 'admins', user.uid);
      unsubAdminDoc = onSnapshot(
        adminRef,
        (adminSnap) => {
          if (!adminSnap.exists()) {
            setAdminProfile(null);
            setUnauthorizedInfo({
              uid: user.uid,
              email: user.email || '',
              reason: 'missing_profile',
            });
            setAuthError(
              'Firebase Authentication succeeded, but this UID does not have an administrator allowlist document in Firestore yet.'
            );
            setStatus('unauthorized');
            preserveUnauthorizedRef.current = true;
            void signOut(auth);
            return;
          }

          const data = adminSnap.data();
          const normalizedRole = normalizeAdminRole(data.role);
          if (data.active !== true || !normalizedRole) {
            setAdminProfile(null);
            setUnauthorizedInfo({
              uid: user.uid,
              email: user.email || '',
              reason: 'disabled',
            });
            setAuthError(
              'This administrator account has been disabled or has an invalid role. Contact a Super Admin.'
            );
            setStatus('unauthorized');
            preserveUnauthorizedRef.current = true;
            void signOut(auth);
            return;
          }

          setUnauthorizedInfo(null);
          setAdminProfile({
            uid: user.uid,
            username: String(data.username || ''),
            email: String(data.email || user.email || ''),
            displayName: String(data.displayName || user.displayName || data.username || 'Admin'),
            role: normalizedRole,
            active: true,
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
            updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(),
          });
          setStatus('authenticated');
        },
        (err) => {
          const msg = err instanceof Error ? err.message : 'Unable to verify administrator role.';
          if (msg.includes('Missing or insufficient permissions')) {
            setAdminProfile(null);
            setUnauthorizedInfo({
              uid: user.uid,
              email: user.email || '',
              reason: 'permission_denied',
            });
            setAuthError(
              `Firestore rejected reading admins/${user.uid} (Missing or insufficient permissions). Ensure the latest firestore.rules are deployed to project "${FIREBASE_PROJECT_ID}" (${FIRESTORE_DATABASE_ID}).`
            );
            setStatus('unauthorized');
            preserveUnauthorizedRef.current = true;
            void signOut(auth);
          } else {
            handleFirestoreError(err, OperationType.GET, `admins/${user.uid}`);
          }
        }
      );
    });

    return () => {
      unsubAdminDoc?.();
      unsubscribeAuth();
    };
  }, [isDemoMode]);

  const signInWithCredentials = useCallback(
    async (identifier: string, password: string, rememberSession = true) => {
      setAuthError(null);
      setUnauthorizedInfo(null);
      preserveUnauthorizedRef.current = false;
      setIsDemoMode(false);
      mfaResolverRef.current = null;
      setMfaChallenge({ active: false, hint: '' });

      const cleanIdentifier = identifier.trim().toLowerCase();
      if (!cleanIdentifier || !password) {
        const msg = 'Please enter both your username and password.';
        setAuthError(msg);
        throw new Error(msg);
      }

      await setPersistence(
        auth,
        rememberSession ? browserLocalPersistence : browserSessionPersistence
      );

      let loginEmail = cleanIdentifier;

      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            identifier: cleanIdentifier,
            password,
          }),
        });

        const data = (await res.json()) as {
          ok?: boolean;
          email?: string;
          code?: string;
          error?: string;
        };

        if (!res.ok || !data.ok || !data.email) {
          const errMsg = data.error || 'Invalid username or password.';
          setAuthError(errMsg);
          throw new Error(errMsg);
        }

        loginEmail = data.email;
      } catch (err) {
        if (err instanceof Error && err.message !== 'Failed to fetch') {
          throw err;
        }
        if (!cleanIdentifier.includes('@')) {
          const msg =
            'Unable to reach server for username verification. Sign in with your administrator email or retry.';
          setAuthError(msg);
          throw new Error(msg);
        }
      }

      try {
        await signInWithEmailAndPassword(auth, loginEmail, password);
      } catch (err) {
        const code = (err as { code?: string })?.code;
        if (code === 'auth/multi-factor-auth-required') {
          const resolver = getMultiFactorResolver(auth, err as never);
          mfaResolverRef.current = resolver;
          const hint =
            resolver.hints[0]?.displayName || 'Authenticator App (6-digit TOTP code)';
          setMfaChallenge({ active: true, hint });
          return;
        }
        if (code === 'auth/too-many-requests') {
          const msg = 'Too many failed sign-in attempts. Please wait before trying again.';
          setAuthError(msg);
          throw new Error(msg);
        }
        if (code === 'auth/user-disabled') {
          const msg = 'This administrator account has been disabled.';
          setAuthError(msg);
          throw new Error(msg);
        }
        const msg = 'Invalid username or password.';
        setAuthError(msg);
        throw new Error(msg);
      }
    },
    []
  );

  const verifyMfaCode = useCallback(async (rawCode: string) => {
    const resolver = mfaResolverRef.current;
    const code = rawCode.trim();
    if (!resolver) {
      throw new Error('MFA session expired. Please sign in again.');
    }
    if (!/^[0-9]{6}$/.test(code)) {
      throw new Error('Please enter the 6-digit verification code from your authenticator app.');
    }

    const totpHint = resolver.hints.find(
      (h) => h.factorId === TotpMultiFactorGenerator.FACTOR_ID
    );
    if (!totpHint) {
      throw new Error('No supported TOTP authenticator factor found on this account.');
    }

    try {
      const assertion = TotpMultiFactorGenerator.assertionForSignIn(totpHint.uid, code);
      await resolver.resolveSignIn(assertion);
      mfaResolverRef.current = null;
      setMfaChallenge({ active: false, hint: '' });
      setAuthError(null);
    } catch {
      const msg = 'Invalid or expired authenticator verification code.';
      setAuthError(msg);
      throw new Error(msg);
    }
  }, []);

  const cancelMfa = useCallback(() => {
    mfaResolverRef.current = null;
    setMfaChallenge({ active: false, hint: '' });
    setAuthError(null);
  }, []);

  const requestPasswordReset = useCallback(async (rawEmail: string): Promise<string> => {
    const email = rawEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('Please enter a valid administrator email address.');
    }

    try {
      const res = await fetch('/api/auth/password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string; error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Unable to process password reset request.');
      }

      if (adminProfile && firebaseUser?.emailVerified) {
        await recordClientAudit(
          'password_reset_requested',
          adminProfile,
          adminProfile.uid,
          'Password reset email requested from Admin Settings.'
        );
      }

      return (
        data.message ||
        'If an active administrator account matches that email, a password reset link has been sent.'
      );
    } catch (err) {
      if (err instanceof Error && err.message !== 'Failed to fetch') {
        throw err;
      }
      // Fallback via Firebase Client SDK (never exposing whether account exists)
      try {
        await sendPasswordResetEmail(auth, email);
      } catch {
        // Swallow auth/user-not-found to prevent enumeration
      }
      return 'If an active administrator account matches that email, a password reset link has been sent.';
    }
  }, [adminProfile, firebaseUser]);

  const sendVerificationEmail = useCallback(async () => {
    if (!auth.currentUser) {
      throw new Error('No active user session.');
    }
    await sendEmailVerification(auth.currentUser);
  }, []);

  const startTotpEnrollment = useCallback(async () => {
    if (!auth.currentUser) {
      throw new Error('You must be signed in to configure MFA.');
    }
    if (!auth.currentUser.emailVerified) {
      throw new Error('Verify your administrator email address before enrolling in TOTP MFA.');
    }
    try {
      const session = await multiFactor(auth.currentUser).getSession();
      const secret = await TotpMultiFactorGenerator.generateSecret(session);
      const qrUri = secret.generateQrCodeUrl(
        auth.currentUser.email || adminProfile?.username || 'admin',
        'GrievanceFlow'
      );
      return {
        secret,
        qrUri,
        manualKey: secret.secretKey,
      };
    } catch (err) {
      const code = (err as { code?: string })?.code || '';
      if (
        code === 'auth/operation-not-allowed' ||
        code === 'auth/requires-recent-login' ||
        code === 'auth/unverified-email'
      ) {
        if (code === 'auth/requires-recent-login') {
          throw new Error('Please sign out and sign back in before modifying MFA settings.');
        }
        throw new Error(
          'TOTP MFA requires Firebase Authentication with Identity Platform enabled in Firebase Console (not available on the default Spark auth tier).'
        );
      }
      throw err instanceof Error ? err : new Error('Unable to initialize TOTP MFA.');
    }
  }, [adminProfile]);

  const completeTotpEnrollment = useCallback(
    async (secret: TotpSecret, rawCode: string, label = 'Authenticator App') => {
      if (!auth.currentUser || !adminProfile) {
        throw new Error('No active authenticated administrator.');
      }
      const code = rawCode.trim();
      if (!/^[0-9]{6}$/.test(code)) {
        throw new Error('Enter the 6-digit code from your authenticator app.');
      }
      const assertion = TotpMultiFactorGenerator.assertionForEnrollment(secret, code);
      await multiFactor(auth.currentUser).enroll(assertion, label);
      await recordClientAudit(
        'mfa_enrolled',
        adminProfile,
        adminProfile.uid,
        'Enrolled optional TOTP multi-factor authentication.'
      );
    },
    [adminProfile]
  );

  const removeMfaFactor = useCallback(
    async (factorUid: string) => {
      if (!auth.currentUser || !adminProfile) {
        throw new Error('No active authenticated administrator.');
      }
      await multiFactor(auth.currentUser).unenroll(factorUid);
      await recordClientAudit(
        'mfa_unenrolled',
        adminProfile,
        adminProfile.uid,
        'Removed TOTP multi-factor authentication factor.'
      );
    },
    [adminProfile]
  );

  const enterDemoMode = useCallback(() => {
    setAuthError(null);
    setUnauthorizedInfo(null);
    preserveUnauthorizedRef.current = false;
    mfaResolverRef.current = null;
    setMfaChallenge({ active: false, hint: '' });
    setIsDemoMode(true);
    setAdminProfile(DEMO_ADMIN_USER);
    setStatus('demo');
  }, []);

  const exitDemoMode = useCallback(() => {
    setIsDemoMode(false);
    setAdminProfile(null);
    setStatus(auth.currentUser ? 'loading' : 'unauthenticated');
  }, []);

  const logout = useCallback(async () => {
    setAuthError(null);
    setUnauthorizedInfo(null);
    preserveUnauthorizedRef.current = false;
    mfaResolverRef.current = null;
    setMfaChallenge({ active: false, hint: '' });
    if (isDemoMode) {
      setIsDemoMode(false);
      setAdminProfile(null);
      setStatus('unauthenticated');
      return;
    }
    if (adminProfile && auth.currentUser) {
      await recordClientAudit(
        'logout',
        adminProfile,
        adminProfile.uid,
        'Administrator signed out securely.'
      );
    }
    await signOut(auth);
    setAdminProfile(null);
    setStatus('unauthenticated');
  }, [isDemoMode, adminProfile]);

  const getIdToken = useCallback(async () => {
    if (!auth.currentUser) return null;
    return auth.currentUser.getIdToken();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        status,
        firebaseUser,
        adminProfile,
        authError,
        unauthorizedInfo,
        isDemoMode,
        integrationStatus,
        mfaChallenge,
        signInWithCredentials,
        verifyMfaCode,
        cancelMfa,
        requestPasswordReset,
        sendVerificationEmail,
        startTotpEnrollment,
        completeTotpEnrollment,
        removeMfaFactor,
        enterDemoMode,
        exitDemoMode,
        logout,
        refreshIntegrationStatus,
        getIdToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
