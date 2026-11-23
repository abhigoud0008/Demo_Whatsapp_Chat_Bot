import React, { useState } from 'react';
import { multiFactor, type TotpSecret } from 'firebase/auth';
import {
  CheckCircle2,
  Database,
  KeyRound,
  Lock,
  LogOut,
  MailCheck,
  RefreshCw,
  Shield,
  ShieldAlert,
  Trash2,
  UserPlus,
  Webhook,
} from 'lucide-react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useAuth } from '../context/AuthContext';
import { useGrievanceData } from '../context/GrievanceContext';
import { useToast } from '../context/ToastContext';
import { ADMIN_ROLES, ADMIN_ROLE_LABELS, type AdminRole } from '../shared/types';

export const SettingsPage: React.FC = () => {
  const {
    adminProfile,
    firebaseUser,
    isDemoMode,
    integrationStatus,
    refreshIntegrationStatus,
    requestPasswordReset,
    sendVerificationEmail,
    startTotpEnrollment,
    completeTotpEnrollment,
    removeMfaFactor,
    logout,
  } = useAuth();
  const {
    admins,
    auditLogs,
    isSuperAdmin,
    createAdminUser,
    updateAdminUser,
    removeAdminUser,
  } = useGrievanceData();
  const { pushToast } = useToast();

  const [newUid, setNewUid] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<AdminRole>('admin');
  const [adding, setAdding] = useState(false);

  const [pendingDeleteUid, setPendingDeleteUid] = useState<string | null>(null);

  // Account security (password reset & optional TOTP MFA)
  const [resetSending, setResetSending] = useState(false);
  const [verifSending, setVerifSending] = useState(false);
  const [totpSetup, setTotpSetup] = useState<{
    secret: TotpSecret;
    qrUri: string;
    manualKey: string;
  } | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [mfaBusy, setMfaBusy] = useState(false);

  const enrolledMfaFactors = firebaseUser ? multiFactor(firebaseUser).enrolledFactors : [];

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);
    try {
      await createAdminUser({
        uid: newUid,
        username: newUsername,
        email: newEmail,
        displayName: newName,
        role: newRole,
      });
      setNewUid('');
      setNewUsername('');
      setNewEmail('');
      setNewName('');
      setNewRole('admin');
    } catch (err) {
      pushToast({
        title: 'Unable to add administrator',
        description: err instanceof Error ? err.message : 'Validation failed',
        variant: 'error',
      });
    } finally {
      setAdding(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!adminProfile?.email) return;
    if (!isDemoMode && !firebaseUser?.emailVerified) {
      pushToast({
        title: 'Verified email required',
        description: 'Verify your administrator email first before requesting a password reset.',
        variant: 'error',
      });
      return;
    }
    setResetSending(true);
    try {
      const msg = await requestPasswordReset(adminProfile.email);
      pushToast({ title: 'Password reset requested', description: msg, variant: 'success' });
    } catch (err) {
      pushToast({
        title: 'Reset failed',
        description: err instanceof Error ? err.message : 'Unable to send reset email',
        variant: 'error',
      });
    } finally {
      setResetSending(false);
    }
  };

  const handleSendVerification = async () => {
    setVerifSending(true);
    try {
      await sendVerificationEmail();
      pushToast({
        title: 'Verification email sent',
        description: 'Check your inbox, click the verification link, and sign back in.',
        variant: 'success',
      });
    } catch (err) {
      pushToast({
        title: 'Unable to send verification',
        description: err instanceof Error ? err.message : 'Please try again later.',
        variant: 'error',
      });
    } finally {
      setVerifSending(false);
    }
  };

  const handleBeginTotp = async () => {
    if (isDemoMode) {
      pushToast({
        title: 'Demo Mode',
        description: 'TOTP MFA enrollment requires a live Firebase Authentication session.',
        variant: 'info',
      });
      return;
    }
    setMfaBusy(true);
    try {
      const setup = await startTotpEnrollment();
      setTotpSetup(setup);
      setTotpCode('');
    } catch (err) {
      pushToast({
        title: 'MFA Setup Notice',
        description: err instanceof Error ? err.message : 'Unable to start MFA enrollment.',
        variant: 'error',
      });
    } finally {
      setMfaBusy(false);
    }
  };

  const handleCompleteTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!totpSetup) return;
    setMfaBusy(true);
    try {
      await completeTotpEnrollment(totpSetup.secret, totpCode);
      setTotpSetup(null);
      setTotpCode('');
      pushToast({
        title: 'Two-factor authentication enabled',
        description: 'Authenticator app TOTP factor enrolled on your account.',
        variant: 'success',
      });
    } catch (err) {
      pushToast({
        title: 'MFA Verification Failed',
        description: err instanceof Error ? err.message : 'Invalid TOTP code.',
        variant: 'error',
      });
    } finally {
      setMfaBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
            Admin Settings &amp; Security
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Manage administrator allowlist access, credential security, and live integration state.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void logout()}
          className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{isDemoMode ? 'Exit Demo Mode' : 'Sign Out'}</span>
        </button>
      </div>

      {/* Top Grid: Admin Profile & Integration States */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <section className="rounded-xl border border-slate-200/90 bg-white p-6 lg:col-span-5">
          <h2 className="font-display text-base font-semibold text-slate-900">
            Active Administrator Profile
          </h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-2.5">
              <dt className="text-slate-500">Username</dt>
              <dd className="font-mono text-xs font-semibold text-slate-900">
                {adminProfile?.username || '—'}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-2.5">
              <dt className="text-slate-500">Display Name</dt>
              <dd className="font-medium text-slate-900">{adminProfile?.displayName}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-2.5">
              <dt className="text-slate-500">Administrator Email</dt>
              <dd className="text-right">
                <span className="font-mono text-xs text-slate-800">{adminProfile?.email}</span>
                {!isDemoMode && (
                  <span
                    className={`mt-0.5 block text-[11px] font-medium ${
                      firebaseUser?.emailVerified ? 'text-emerald-700' : 'text-amber-700'
                    }`}
                  >
                    {firebaseUser?.emailVerified ? 'Verified Email' : 'Email Unverified'}
                  </span>
                )}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-2.5">
              <dt className="text-slate-500">Authorized Role</dt>
              <dd className="font-medium text-emerald-800">
                {adminProfile ? ADMIN_ROLE_LABELS[adminProfile.role] : '—'}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-slate-500">Session Type</dt>
              <dd className="text-xs text-slate-700">
                {isDemoMode ? 'Client Demo Mode (Local State)' : 'Firebase Email/Password Auth'}
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-xl border border-slate-200/90 bg-white p-6 lg:col-span-7">
          <div className="flex items-center justify-between gap-4">
            <h2 className="font-display text-base font-semibold text-slate-900">
              Integration &amp; Security State
            </h2>
            <button
              type="button"
              onClick={() => void refreshIntegrationStatus()}
              className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Re-check</span>
            </button>
          </div>

          <div className="mt-4 rounded-lg bg-slate-50/80 p-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <div className="flex items-center gap-2 text-xs font-medium text-slate-700">
                  <Database className="h-4 w-4 text-emerald-700" aria-hidden="true" />
                  <span>Firebase Auth &amp; Firestore</span>
                </div>
                <p className="mt-1.5 text-sm font-semibold text-slate-900">
                  {integrationStatus.firebaseConnected ? 'Connected' : 'Not Connected'}
                </p>
                <p className="mt-0.5 font-mono text-[11px] text-slate-500">
                  Project: {integrationStatus.firebaseProjectId || 'Unconfigured'}
                </p>
              </div>

              <div className="border-t border-slate-200/70 pt-3 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-4">
                <div className="flex items-center gap-2 text-xs font-medium text-slate-700">
                  <Webhook className="h-4 w-4 text-emerald-700" aria-hidden="true" />
                  <span>Meta WhatsApp Cloud API</span>
                </div>
                <p className="mt-1.5 text-sm font-semibold text-slate-900">
                  {integrationStatus.whatsappConnected ? 'Connected' : 'Not Connected'}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {integrationStatus.webhookConfigured
                    ? 'Webhook security: Configured'
                    : 'Dashboard & Simulator operate standalone'}
                </p>
              </div>
            </div>

            <div className="mt-3.5 border-t border-slate-200/70 pt-3 text-xs text-slate-600">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-slate-700">Username Login Resolution</span>
                <span className="font-mono text-[11px] text-slate-800">
                  {integrationStatus.usernameLoginReady
                    ? 'Server-Side Active (Zero Enumeration)'
                    : 'Email Fallback Mode (Set FIREBASE_ADMIN_CREDENTIALS_JSON)'}
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-slate-700">24h+ Utility Template</span>
                <span className="font-mono text-[11px] text-slate-700">
                  {integrationStatus.resolutionTemplateConfigured
                    ? 'Configured'
                    : 'Optional (24h customer-service window active)'}
                </span>
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
                Passwords are never stored in Firestore or frontend code. Server-side username
                lookup and webhook persistence use a single{' '}
                <code className="font-mono text-slate-700">FIREBASE_ADMIN_CREDENTIALS_JSON</code>{' '}
                secret for a dedicated least-privilege{' '}
                <code className="font-mono text-slate-700">roles/datastore.user</code> service
                account.
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-100 pt-3.5 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />
              Rate-Limited Auth &amp; HMAC-SHA256
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />
              Default-Deny Firestore Rules
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />
              Immutable Security Audit Trail
            </span>
          </div>

          <p className="mt-2.5 text-xs text-slate-500">
            Last verified webhook event:{' '}
            <span className="font-mono">
              {integrationStatus.lastWebhookEventAt
                ? new Date(integrationStatus.lastWebhookEventAt).toLocaleString()
                : 'None recorded in current server session'}
            </span>
          </p>
        </section>
      </div>

      {/* Password Reset & Optional TOTP MFA */}
      <section className="rounded-xl border border-slate-200/90 bg-white p-6">
        <h2 className="font-display text-base font-semibold text-slate-900">
          Password Recovery &amp; Multi-Factor Authentication
        </h2>
        <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <MailCheck className="h-4 w-4 text-emerald-700" aria-hidden="true" />
              <span>Password Reset via Verified Email</span>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
              Send a Firebase Authentication password reset link to your verified administrator
              email address ({adminProfile?.email}).
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {!isDemoMode && !firebaseUser?.emailVerified && (
                <button
                  type="button"
                  disabled={verifSending}
                  onClick={() => void handleSendVerification()}
                  className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                >
                  {verifSending ? 'Sending...' : 'Send Email Verification Link'}
                </button>
              )}
              <button
                type="button"
                disabled={resetSending || isDemoMode}
                onClick={() => void handlePasswordReset()}
                className="rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {resetSending ? 'Sending Reset Link...' : 'Send Password Reset Email'}
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <KeyRound className="h-4 w-4 text-emerald-700" aria-hidden="true" />
              <span>Optional TOTP Authenticator MFA</span>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
              Protect your administrator account with a 6-digit authenticator app code. Note:
              Firebase TOTP MFA requires Firebase Identity Platform enabled in Firebase Console.
            </p>

            {enrolledMfaFactors.length > 0 && (
              <div className="mt-3 space-y-2">
                {enrolledMfaFactors.map((factor) => (
                  <div
                    key={factor.uid}
                    className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs"
                  >
                    <span className="font-medium text-emerald-900">
                      {factor.displayName || 'Authenticator App'} (Enrolled)
                    </span>
                    <button
                      type="button"
                      onClick={() => void removeMfaFactor(factor.uid)}
                      className="font-medium text-rose-700 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}

            {totpSetup ? (
              <form onSubmit={(e) => void handleCompleteTotp(e)} className="mt-3 space-y-2.5">
                <p className="rounded-lg border border-slate-200 bg-white p-2.5 font-mono text-[11px] break-all text-slate-800">
                  Secret Key: {totpSetup.manualKey}
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    required
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="6-digit code"
                    className="w-36 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-mono text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={mfaBusy || totpCode.length !== 6}
                    className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
                  >
                    Verify &amp; Enable
                  </button>
                  <button
                    type="button"
                    onClick={() => setTotpSetup(null)}
                    className="text-xs text-slate-500 hover:text-slate-800"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="mt-3">
                <button
                  type="button"
                  disabled={mfaBusy || isDemoMode}
                  onClick={() => void handleBeginTotp()}
                  className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-100 disabled:opacity-50"
                >
                  {mfaBusy ? 'Initializing...' : 'Enable Authenticator App (TOTP)'}
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Super Admin Allowlist Management */}
      <section className="rounded-xl border border-slate-200/90 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Authorized Administrator Allowlist
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Create the Email/Password account in Firebase Authentication (or via{' '}
              <code className="font-mono">npm run bootstrap:admin</code>), then authorize its UID
              and unique username below.
            </p>
          </div>
          {!isSuperAdmin && (
            <span className="text-xs text-slate-500">
              Super Admin role required to modify allowlist
            </span>
          )}
        </div>

        {isSuperAdmin && (
          <form
            onSubmit={(e) => void handleCreateAdmin(e)}
            className="mt-4 grid grid-cols-1 gap-3 border-b border-slate-100 pb-5 sm:grid-cols-12"
          >
            <div className="sm:col-span-2">
              <label htmlFor="admin-uid" className="block text-xs font-medium text-slate-600">
                Firebase Auth UID
              </label>
              <input
                id="admin-uid"
                type="text"
                required
                value={newUid}
                onChange={(e) => setNewUid(e.target.value)}
                placeholder="xK92mPq..."
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="admin-uname" className="block text-xs font-medium text-slate-600">
                Username
              </label>
              <input
                id="admin-uname"
                type="text"
                required
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="ops.lead"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
              />
            </div>
            <div className="sm:col-span-3">
              <label htmlFor="admin-email" className="block text-xs font-medium text-slate-600">
                Auth Email
              </label>
              <input
                id="admin-email"
                type="email"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="admin@company.com"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="admin-name" className="block text-xs font-medium text-slate-600">
                Display Name
              </label>
              <input
                id="admin-name"
                type="text"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Full Name"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="admin-role" className="block text-xs font-medium text-slate-600">
                Role
              </label>
              <select
                id="admin-role"
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as AdminRole)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-800 focus:border-emerald-600 focus:outline-none"
              >
                {ADMIN_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ADMIN_ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end sm:col-span-1">
              <button
                type="submit"
                disabled={adding}
                aria-label="Add administrator"
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Add</span>
              </button>
            </div>
          </form>
        )}

        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-medium text-slate-500">
                <th className="py-2.5 pr-4">Administrator</th>
                <th className="py-2.5 pr-4">Username</th>
                <th className="py-2.5 pr-4">Email</th>
                <th className="py-2.5 pr-4">Role</th>
                <th className="py-2.5 pr-4">Status</th>
                {isSuperAdmin && <th className="py-2.5 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {admins.map((a) => (
                <tr key={a.uid}>
                  <td className="py-3 pr-4">
                    <p className="font-medium text-slate-900">{a.displayName}</p>
                    <p className="font-mono text-[11px] text-slate-400">{a.uid}</p>
                  </td>
                  <td className="py-3 pr-4 font-mono text-xs text-slate-800">
                    {a.username || '—'}
                  </td>
                  <td className="py-3 pr-4 font-mono text-xs text-slate-700">{a.email}</td>
                  <td className="py-3 pr-4">
                    {isSuperAdmin && a.uid !== adminProfile?.uid ? (
                      <select
                        aria-label={`Role for ${a.displayName}`}
                        value={a.role}
                        onChange={(e) =>
                          void updateAdminUser(a.uid, {
                            username: a.username,
                            displayName: a.displayName,
                            role: e.target.value as AdminRole,
                            active: a.active,
                          })
                        }
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800"
                      >
                        {ADMIN_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ADMIN_ROLE_LABELS[r]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-xs font-medium text-slate-800">
                        {ADMIN_ROLE_LABELS[a.role] ?? a.role}
                      </span>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-xs">
                    {isSuperAdmin && a.uid !== adminProfile?.uid ? (
                      <button
                        type="button"
                        onClick={() =>
                          void updateAdminUser(a.uid, {
                            username: a.username,
                            displayName: a.displayName,
                            role: a.role,
                            active: !a.active,
                          })
                        }
                        className={`rounded-md border px-2 py-0.5 text-xs font-medium ${
                          a.active
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                            : 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                        }`}
                      >
                        {a.active ? 'Active (Disable)' : 'Disabled (Enable)'}
                      </button>
                    ) : (
                      <span className={a.active ? 'font-medium text-emerald-700' : 'text-rose-600'}>
                        {a.active ? 'Active' : 'Disabled'}
                      </span>
                    )}
                  </td>
                  {isSuperAdmin && (
                    <td className="py-3 text-right">
                      {a.uid !== adminProfile?.uid && (
                        <button
                          type="button"
                          onClick={() => setPendingDeleteUid(a.uid)}
                          aria-label={`Remove ${a.displayName}`}
                          className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Immutable Security Audit Log (Super Admin Only) */}
      {isSuperAdmin && (
        <section className="rounded-xl border border-slate-200/90 bg-white p-6">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <ShieldAlert className="h-4 w-4 text-emerald-700" aria-hidden="true" />
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                Security &amp; Administrative Audit Log
              </h2>
              <p className="text-xs text-slate-500">
                Append-only record of sign-ins, rate limits, role updates, and complaint actions.
              </p>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            {auditLogs.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500">
                No security audit entries recorded yet.
              </p>
            ) : (
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 pr-4">Timestamp</th>
                    <th className="py-2 pr-4">Action</th>
                    <th className="py-2 pr-4">Actor</th>
                    <th className="py-2">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {auditLogs.slice(0, 25).map((entry) => (
                    <tr key={entry.id}>
                      <td className="py-2.5 pr-4 font-mono whitespace-nowrap text-slate-500 tabular-nums">
                        {entry.timestamp.toLocaleString()}
                      </td>
                      <td className="py-2.5 pr-4 font-mono font-medium whitespace-nowrap text-slate-800">
                        {entry.action}
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-slate-700">
                        {entry.actorUsername || entry.actorEmail || entry.actorUid}
                      </td>
                      <td className="py-2.5 text-slate-600">{entry.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      )}

      <ConfirmDialog
        open={Boolean(pendingDeleteUid)}
        title="Remove Administrator"
        description="Removing this user immediately revokes their Firestore read and write access."
        confirmLabel="Remove Access"
        confirmVariant="danger"
        onCancel={() => setPendingDeleteUid(null)}
        onConfirm={() => {
          if (pendingDeleteUid) {
            void removeAdminUser(pendingDeleteUid);
          }
          setPendingDeleteUid(null);
        }}
      />
    </div>
  );
};
