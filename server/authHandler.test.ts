import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { Firestore } from 'firebase-admin/firestore';
import netlifyAuthLoginHandler from '../netlify/functions/auth-login.ts';
import netlifyAuthResetHandler from '../netlify/functions/auth-password-reset.ts';
import {
  clearInMemoryAuthRateLimitsForTests,
  processAuthLogin,
  processPasswordResetRequest,
} from './authHandler.ts';
import {
  validateAdminInput,
  validateStrongPassword,
  validateUsername,
} from '../src/shared/validation.ts';

function createFakeFirestore(admins: Array<{
  uid: string;
  username: string;
  email: string;
  role: string;
  active: boolean;
}>) {
  const auditLogs: Array<Record<string, unknown>> = [];
  const rateLimits = new Map<string, Record<string, unknown>>();

  const makeDocSnap = (doc: { uid: string; username: string; email: string; role: string; active: boolean } | undefined) => ({
    exists: Boolean(doc),
    id: doc?.uid ?? '',
    get(field: string) {
      if (!doc) return undefined;
      return (doc as Record<string, unknown>)[field];
    },
  });

  const db = {
    collection(name: string) {
      if (name === 'admins') {
        return {
          doc(uid: string) {
            return {
              async get() {
                return makeDocSnap(admins.find((a) => a.uid === uid));
              },
            };
          },
          where(field: string, _op: string, value: string) {
            return {
              limit() {
                return {
                  async get() {
                    const matched = admins.filter(
                      (a) => String((a as Record<string, unknown>)[field] || '').toLowerCase() === value.toLowerCase()
                    );
                    return {
                      empty: matched.length === 0,
                      docs: matched.map((m) => makeDocSnap(m)),
                    };
                  },
                };
              },
            };
          },
        };
      }

      if (name === 'admin_audit_logs') {
        return {
          async add(entry: Record<string, unknown>) {
            auditLogs.push(entry);
          },
        };
      }

      if (name === 'auth_rate_limits') {
        return {
          doc(id: string) {
            return {
              id,
              async get() {
                const record = rateLimits.get(id);
                return {
                  exists: Boolean(record),
                  get(field: string) {
                    return record?.[field];
                  },
                };
              },
              async delete() {
                rateLimits.delete(id);
              },
            };
          },
        };
      }

      throw new Error(`Unexpected collection: ${name}`);
    },
    async runTransaction(
      fn: (tx: {
        get: (ref: { id: string }) => Promise<{ exists: boolean; get: (f: string) => unknown }>;
        set: (ref: { id: string }, data: Record<string, unknown>) => void;
      }) => Promise<unknown>
    ) {
      return fn({
        async get(ref) {
          const record = rateLimits.get(ref.id);
          return {
            exists: Boolean(record),
            get(field: string) {
              return record?.[field];
            },
          };
        },
        set(ref, data) {
          rateLimits.set(ref.id, data);
        },
      });
    },
  };

  return {
    db: db as unknown as Firestore,
    auditLogs,
  };
}

test('processAuthLogin verifies correct email/password in id_token_only mode', async () => {
  clearInMemoryAuthRateLimitsForTests();
  const res = await processAuthLogin({
    body: { identifier: 'admin@example.com', password: 'Valid!Password123' },
    clientIp: '10.0.0.1',
    firestoreOverride: null,
    verifyPassword: async (email, password) => {
      assert.equal(email, 'admin@example.com');
      assert.equal(password, 'Valid!Password123');
      return { ok: true, localId: 'uid-admin-1' };
    },
  });

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, {
    ok: true,
    mode: 'email_signin',
    email: 'admin@example.com',
    mfaRequired: false,
  });
});

test('processAuthLogin resolves username -> email server-side and audits login_success', async () => {
  clearInMemoryAuthRateLimitsForTests();
  const { db, auditLogs } = createFakeFirestore([
    {
      uid: 'uid-super-1',
      username: 'sa_ops',
      email: 'ops.super@example.com',
      role: 'super_admin',
      active: true,
    },
  ]);

  const res = await processAuthLogin({
    body: { identifier: 'SA_OPS', password: 'Valid!Password123' },
    clientIp: '10.0.0.2',
    firestoreOverride: db,
    verifyPassword: async (email) => {
      assert.equal(email, 'ops.super@example.com');
      return { ok: true, localId: 'uid-super-1' };
    },
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.email, 'ops.super@example.com');
  assert.equal(auditLogs.length, 1);
  assert.equal(auditLogs[0].action, 'login_success');
});

test('processAuthLogin returns identical generic 401 for unknown username and wrong password (anti-enumeration)', async () => {
  clearInMemoryAuthRateLimitsForTests();
  const { db } = createFakeFirestore([
    {
      uid: 'uid-admin-1',
      username: 'known_admin',
      email: 'known@example.com',
      role: 'admin',
      active: true,
    },
  ]);

  const unknownUserRes = await processAuthLogin({
    body: { identifier: 'nonexistent_user', password: 'SomePassword!123' },
    clientIp: '10.0.0.3',
    firestoreOverride: db,
    verifyPassword: async () => ({ ok: false }),
  });

  const wrongPasswordRes = await processAuthLogin({
    body: { identifier: 'known_admin', password: 'WrongPassword!123' },
    clientIp: '10.0.0.4',
    firestoreOverride: db,
    verifyPassword: async () => ({ ok: false }),
  });

  assert.equal(unknownUserRes.status, 401);
  assert.equal(wrongPasswordRes.status, 401);
  assert.deepEqual(unknownUserRes.body, wrongPasswordRes.body);
  assert.equal(unknownUserRes.body.error, 'Invalid username or password.');
});

test('processAuthLogin rejects disabled admin and unauthorized Firebase Auth user after password verification', async () => {
  clearInMemoryAuthRateLimitsForTests();
  const { db, auditLogs } = createFakeFirestore([
    {
      uid: 'uid-disabled',
      username: 'disabled_admin',
      email: 'disabled@example.com',
      role: 'admin',
      active: false,
    },
  ]);

  const disabledRes = await processAuthLogin({
    body: { identifier: 'disabled_admin', password: 'Valid!Password123' },
    clientIp: '10.0.0.5',
    firestoreOverride: db,
    verifyPassword: async () => ({ ok: true, localId: 'uid-disabled' }),
  });

  assert.equal(disabledRes.status, 403);
  assert.match(String(disabledRes.body.error), /disabled/i);

  const unauthorizedRes = await processAuthLogin({
    body: { identifier: 'outsider@example.com', password: 'Valid!Password123' },
    clientIp: '10.0.0.6',
    firestoreOverride: db,
    verifyPassword: async () => ({ ok: true, localId: 'uid-outsider' }),
  });

  assert.equal(unauthorizedRes.status, 403);
  assert.match(String(unauthorizedRes.body.error), /not authorized/i);
  assert.equal(auditLogs[0].action, 'login_denied_disabled');
  assert.equal(auditLogs[1].action, 'login_denied_unauthorized');
});

test('processAuthLogin fails safely to email fallback when username is entered in id_token_only mode', async () => {
  clearInMemoryAuthRateLimitsForTests();
  const res = await processAuthLogin({
    body: { identifier: 'sa_ops', password: 'Valid!Password123' },
    clientIp: '10.0.0.7',
    firestoreOverride: null,
  });

  assert.equal(res.status, 400);
  assert.equal(res.body.code, 'USERNAME_LOOKUP_UNAVAILABLE');
});

test('processAuthLogin enforces sliding-window rate limit after 5 failed attempts', async () => {
  clearInMemoryAuthRateLimitsForTests();
  for (let i = 0; i < 5; i++) {
    const failed = await processAuthLogin({
      body: { identifier: 'admin@example.com', password: 'Wrong!Password123' },
      clientIp: '10.0.0.8',
      firestoreOverride: null,
      verifyPassword: async () => ({ ok: false }),
    });
    assert.equal(failed.status, 401);
  }

  const blocked = await processAuthLogin({
    body: { identifier: 'admin@example.com', password: 'Valid!Password123' },
    clientIp: '10.0.0.8',
    firestoreOverride: null,
    verifyPassword: async () => ({ ok: true, localId: 'uid-1' }),
  });
  assert.equal(blocked.status, 429);
  assert.match(String(blocked.body.error), /Too many failed sign-in attempts/i);
});

test('processPasswordResetRequest never reveals whether email exists and enforces rate limit', async () => {
  clearInMemoryAuthRateLimitsForTests();
  const { db, auditLogs } = createFakeFirestore([
    {
      uid: 'uid-admin-1',
      username: 'active_admin',
      email: 'active@example.com',
      role: 'admin',
      active: true,
    },
  ]);

  let sentTo: string[] = [];
  const unknownRes = await processPasswordResetRequest({
    body: { email: 'unknown@example.com' },
    clientIp: '10.0.0.9',
    firestoreOverride: db,
    sendResetEmail: async (email) => {
      sentTo.push(email);
      return true;
    },
  });
  const knownRes = await processPasswordResetRequest({
    body: { email: 'active@example.com' },
    clientIp: '10.0.0.9',
    firestoreOverride: db,
    sendResetEmail: async (email) => {
      sentTo.push(email);
      return true;
    },
  });

  assert.equal(unknownRes.status, 200);
  assert.equal(knownRes.status, 200);
  assert.deepEqual(unknownRes.body, knownRes.body);
  assert.deepEqual(sentTo, ['active@example.com']);
  assert.equal(auditLogs.length, 1);
  assert.equal(auditLogs[0].action, 'password_reset_requested');

  for (let i = 0; i < 2; i++) {
    await processPasswordResetRequest({
      body: { email: 'active@example.com' },
      clientIp: '10.0.0.9',
      firestoreOverride: db,
      sendResetEmail: async () => true,
    });
  }
  const rateLimited = await processPasswordResetRequest({
    body: { email: 'active@example.com' },
    clientIp: '10.0.0.9',
    firestoreOverride: db,
    sendResetEmail: async () => true,
  });
  assert.equal(rateLimited.status, 429);
});

test('validation helpers enforce strong passwords, valid usernames, and no password storage in rules', () => {
  assert.equal(validateUsername('sa_ops-01').valid, true);
  assert.equal(validateUsername('ab').valid, false);
  assert.equal(validateUsername('admin@example.com').valid, false);

  assert.equal(validateStrongPassword('short').valid, false);
  assert.equal(validateStrongPassword('lowercaseonly123!').valid, false);
  assert.equal(validateStrongPassword('Valid!StrongPass99').valid, true);

  assert.equal(
    validateAdminInput({
      uid: 'uid_abc_123',
      username: 'ops_admin',
      email: 'ops@example.com',
      displayName: 'Ops Admin',
      role: 'admin',
    }).valid,
    true
  );

  // Verify firestore.rules strictly locks admins fields via hasOnly and forbids password fields
  const rulesText = fs.readFileSync(path.resolve('firestore.rules'), 'utf8');
  assert.match(
    rulesText,
    /keys\(\)\.hasOnly\(\['uid', 'username', 'email', 'displayName', 'role', 'active', 'createdAt', 'updatedAt'\]\)/
  );
  assert.equal(rulesText.includes('abhigoud9346@gmail.com'), false);
  assert.equal(rulesText.includes('passwordHash'), false);
});

test('Netlify auth-login and auth-password-reset handlers reject non-POST and malformed JSON', async () => {
  const getLogin = await netlifyAuthLoginHandler(
    new Request('https://demo.netlify.app/api/auth/login', { method: 'GET' })
  );
  assert.equal(getLogin.status, 405);

  const badJsonLogin = await netlifyAuthLoginHandler(
    new Request('https://demo.netlify.app/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{invalid-json',
    })
  );
  assert.equal(badJsonLogin.status, 400);

  const getReset = await netlifyAuthResetHandler(
    new Request('https://demo.netlify.app/api/auth/password-reset', { method: 'GET' })
  );
  assert.equal(getReset.status, 405);
});
