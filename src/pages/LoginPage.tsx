import React, { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  MessageSquare,
  ShieldCheck,
  User as UserIcon,
} from 'lucide-react';
import { HoverBorderGradient } from '../components/aceternity/HoverBorderGradient';
import { Spotlight } from '../components/aceternity/Spotlight';
import { useAuth } from '../context/AuthContext';

export const LoginPage: React.FC = () => {
  const {
    status,
    authError,
    unauthorizedInfo,
    integrationStatus,
    mfaChallenge,
    signInWithCredentials,
    verifyMfaCode,
    cancelMfa,
    requestPasswordReset,
    enterDemoMode,
    logout,
  } = useAuth();

  const shouldReduceMotion = useReducedMotion();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberSession, setRememberSession] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [copiedUid, setCopiedUid] = useState(false);

  const [mfaCode, setMfaCode] = useState('');
  const [verifyingMfa, setVerifyingMfa] = useState(false);

  const [forgotMode, setForgotMode] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetNotice, setResetNotice] = useState<string | null>(null);

  const isLoading = status === 'loading' || submitting;
  const isUnauthorized = status === 'unauthorized';
  const displayError = localError || authError;

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setSubmitting(true);
    try {
      await signInWithCredentials(identifier, password, rememberSession);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setVerifyingMfa(true);
    try {
      await verifyMfaCode(mfaCode);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Invalid verification code.');
    } finally {
      setVerifyingMfa(false);
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setResetNotice(null);
    setResetLoading(true);
    try {
      const msg = await requestPasswordReset(resetEmail);
      setResetNotice(msg);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Unable to process password reset.');
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col justify-center overflow-hidden bg-[#FAF9F6] px-4 py-10 sm:px-6 lg:px-8">
      <Spotlight className="-top-40 left-0 md:-top-20 md:left-40" />

      <motion.div
        initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 mx-auto w-full max-w-4xl"
      >
        <div className="grid grid-cols-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:grid-cols-12">
          {/* Left Context Column */}
          <div className="flex flex-col justify-between border-b border-slate-100 bg-slate-50/75 p-7 sm:p-8 lg:col-span-6 lg:border-r lg:border-b-0">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-700 text-white shadow-xs">
                  <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                </div>
                <span className="font-display text-lg font-bold tracking-tight text-slate-900">
                  GrievanceFlow
                </span>
              </div>

              <h1 className="mt-7 font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl text-balance">
                WhatsApp Grievance Resolution Console
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">
                Centralized administrative workspace for reviewing, routing, and resolving customer
                complaints submitted over WhatsApp with real-time Cloud Firestore synchronization.
              </p>

              <ul className="mt-6 space-y-3 text-sm text-slate-700">
                <li className="flex items-start gap-2.5">
                  <Lock className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
                  <span>
                    Server-verified username sign-in with role-based Firestore security rules
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
                  <span>Deterministic WhatsApp menu intake and collision-safe GRV ticket IDs</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
                  <span>Audited resolution workflow with Meta delivery status tracking</span>
                </li>
              </ul>
            </div>

            <div className="mt-8 border-t border-slate-200/80 pt-4">
              <p className="text-xs font-medium text-slate-500">Live Environment Readiness</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-600">
                <span>
                  Firebase:{' '}
                  <strong className={integrationStatus.firebaseConnected ? 'text-emerald-700' : 'text-slate-700'}>
                    {integrationStatus.firebaseConnected ? 'Connected' : 'Checking'}
                  </strong>
                </span>
                <span>
                  WhatsApp API:{' '}
                  <strong className={integrationStatus.whatsappConnected ? 'text-emerald-700' : 'text-amber-700'}>
                    {integrationStatus.whatsappConnected ? 'Connected' : 'Not Connected'}
                  </strong>
                </span>
                <span>
                  Login Mode:{' '}
                  <strong className="text-slate-800">
                    {integrationStatus.usernameLoginReady ? 'Username + Email' : 'Email Fallback'}
                  </strong>
                </span>
              </div>
            </div>
          </div>

          {/* Right Auth Column */}
          <div className="flex flex-col justify-center p-7 sm:p-8 lg:col-span-6">
            {isUnauthorized ? (
              <div>
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                  <AlertCircle className="h-5 w-5" aria-hidden="true" />
                </div>
                <h2 className="mt-4 font-display text-xl font-semibold text-slate-900">
                  Access Restricted
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  {displayError ||
                    'Your account is not active on the authorized administrator allowlist for GrievanceFlow.'}
                </p>

                {unauthorizedInfo?.reason === 'missing_profile' && (
                  <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-700">
                    <p className="font-medium text-slate-900">
                      Provision your administrator document in Firestore:
                    </p>
                    <p className="mt-1 text-slate-600">
                      Create document <code className="font-mono text-slate-900">admins/{unauthorizedInfo.uid}</code> in{' '}
                      <code className="font-mono text-slate-900">{integrationStatus.firebaseProjectId}</code> with{' '}
                      <code className="font-mono">uid</code>, <code className="font-mono">username</code>,{' '}
                      <code className="font-mono">email</code> ({unauthorizedInfo.email}),{' '}
                      <code className="font-mono">displayName</code>, <code className="font-mono">role: &quot;super_admin&quot;</code>,{' '}
                      <code className="font-mono">active: true</code>, <code className="font-mono">createdAt</code>, and{' '}
                      <code className="font-mono">updatedAt</code>.
                    </p>
                    <div className="mt-2.5 flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
                      <code className="truncate font-mono text-[11px] text-slate-800">
                        UID: {unauthorizedInfo.uid}
                      </code>
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard?.writeText(unauthorizedInfo.uid);
                          setCopiedUid(true);
                          setTimeout(() => setCopiedUid(false), 2000);
                        }}
                        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                      >
                        {copiedUid ? (
                          <>
                            <Check className="h-3 w-3 text-emerald-600" aria-hidden="true" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" aria-hidden="true" />
                            <span>Copy UID</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setLocalError(null);
                      setCopiedUid(false);
                      void logout();
                    }}
                    className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
                  >
                    Return to Sign In
                  </button>
                  <button
                    type="button"
                    onClick={enterDemoMode}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Enter Client Demo Mode
                  </button>
                </div>
              </div>
            ) : mfaChallenge.active ? (
              <div>
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                  <KeyRound className="h-5 w-5" aria-hidden="true" />
                </div>
                <h2 className="mt-4 font-display text-xl font-semibold text-slate-900">
                  Two-Factor Verification
                </h2>
                <p className="mt-1.5 text-sm text-slate-600">
                  Enter the 6-digit verification code from your authenticator app ({mfaChallenge.hint}).
                </p>

                {displayError && (
                  <div
                    role="alert"
                    className="mt-4 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
                    <span>{displayError}</span>
                  </div>
                )}

                <form onSubmit={(e) => void handleMfaSubmit(e)} className="mt-5 space-y-4">
                  <div>
                    <label htmlFor="mfa-code" className="block text-xs font-medium text-slate-700">
                      6-Digit Authenticator Code
                    </label>
                    <input
                      id="mfa-code"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      required
                      value={mfaCode}
                      onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="000000"
                      className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-center font-mono text-lg tracking-[0.35em] text-slate-900 placeholder:text-slate-300 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15 focus:outline-none"
                    />
                  </div>

                  <HoverBorderGradient
                    type="submit"
                    disabled={verifyingMfa || mfaCode.length !== 6}
                    containerClassName="w-full"
                    className="w-full py-2.5"
                  >
                    {verifyingMfa && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                    <span>{verifyingMfa ? 'Verifying code...' : 'Verify & Sign In'}</span>
                  </HoverBorderGradient>

                  <button
                    type="button"
                    onClick={() => {
                      setMfaCode('');
                      setLocalError(null);
                      cancelMfa();
                    }}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Cancel and return to sign in</span>
                  </button>
                </form>
              </div>
            ) : forgotMode ? (
              <div>
                <h2 className="font-display text-xl font-semibold text-slate-900">
                  Reset Administrator Password
                </h2>
                <p className="mt-1.5 text-sm text-slate-600">
                  Enter your verified administrator email address to receive a password reset link.
                </p>

                {displayError && (
                  <div
                    role="alert"
                    className="mt-4 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
                    <span>{displayError}</span>
                  </div>
                )}

                {resetNotice && (
                  <div
                    role="status"
                    className="mt-4 flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900"
                  >
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
                    <span>{resetNotice}</span>
                  </div>
                )}

                <form onSubmit={(e) => void handleResetSubmit(e)} className="mt-5 space-y-4">
                  <div>
                    <label htmlFor="reset-email" className="block text-xs font-medium text-slate-700">
                      Administrator Email
                    </label>
                    <input
                      id="reset-email"
                      type="email"
                      required
                      autoComplete="email"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      placeholder="admin@organization.com"
                      className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15 focus:outline-none"
                    />
                  </div>

                  <HoverBorderGradient
                    type="submit"
                    disabled={resetLoading || !resetEmail.trim()}
                    containerClassName="w-full"
                    className="w-full py-2.5"
                  >
                    {resetLoading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                    <span>{resetLoading ? 'Sending link...' : 'Send Reset Link'}</span>
                  </HoverBorderGradient>

                  <button
                    type="button"
                    onClick={() => {
                      setForgotMode(false);
                      setLocalError(null);
                      setResetNotice(null);
                    }}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Back to Sign In</span>
                  </button>
                </form>
              </div>
            ) : (
              <div>
                <h2 className="font-display text-xl font-semibold text-slate-900">
                  Administrator Sign-In
                </h2>
                <p className="mt-1.5 text-sm text-slate-600">
                  Sign in with your provisioned administrator credentials. Public registration is disabled.
                </p>

                {displayError && (
                  <div
                    role="alert"
                    className="mt-4 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
                    <span>{displayError}</span>
                  </div>
                )}

                <form onSubmit={(e) => void handleLoginSubmit(e)} className="mt-5 space-y-4">
                  <div>
                    <label htmlFor="admin-username" className="block text-xs font-medium text-slate-700">
                      {integrationStatus.usernameLoginReady
                        ? 'Username (or Administrator Email)'
                        : 'Administrator Email (or Username)'}
                    </label>
                    <div className="relative mt-1.5">
                      <UserIcon
                        className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400"
                        aria-hidden="true"
                      />
                      <input
                        id="admin-username"
                        name="username"
                        type="text"
                        required
                        autoComplete="username"
                        value={identifier}
                        onChange={(e) => setIdentifier(e.target.value)}
                        placeholder={
                          integrationStatus.usernameLoginReady
                            ? 'e.g. sa_admin01'
                            : 'e.g. admin@organization.com'
                        }
                        className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pr-3.5 pl-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15 focus:outline-none"
                      />
                    </div>
                    {!integrationStatus.usernameLoginReady && (
                      <p className="mt-1 text-[11px] text-slate-500">
                        Email fallback is active until server Firestore credentials are configured.
                      </p>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <label htmlFor="admin-password" className="block text-xs font-medium text-slate-700">
                        Password
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setLocalError(null);
                          setResetNotice(null);
                          setForgotMode(true);
                        }}
                        className="text-xs font-medium text-emerald-700 hover:text-emerald-800 hover:underline"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <div className="relative mt-1.5">
                      <Lock
                        className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400"
                        aria-hidden="true"
                      />
                      <input
                        id="admin-password"
                        name="password"
                        type={showPassword ? 'text' : 'password'}
                        required
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter your password"
                        className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pr-11 pl-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <Eye className="h-4 w-4" aria-hidden="true" />
                        )}
                      </button>
                    </div>
                  </div>

                  <label className="flex items-center gap-2 text-xs text-slate-600 select-none">
                    <input
                      type="checkbox"
                      checked={rememberSession}
                      onChange={(e) => setRememberSession(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
                    />
                    <span>Keep me signed in on this trusted browser</span>
                  </label>

                  <HoverBorderGradient
                    type="submit"
                    disabled={isLoading || !identifier.trim() || !password}
                    containerClassName="w-full"
                    className="w-full py-2.5"
                  >
                    {isLoading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                    <span>{isLoading ? 'Signing in...' : 'Sign In'}</span>
                  </HoverBorderGradient>
                </form>

                <div className="relative my-5">
                  <div className="absolute inset-0 flex items-center" aria-hidden="true">
                    <div className="w-full border-t border-slate-200" />
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="bg-white px-2.5 text-slate-400">or evaluate the console</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={enterDemoMode}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  <Eye className="h-4 w-4 text-emerald-700" aria-hidden="true" />
                  <span>Enter Client Demo Mode</span>
                </button>

                <p className="mt-4 text-xs leading-relaxed text-slate-500">
                  Client Demo Mode loads local sample complaints and the WhatsApp simulator without
                  modifying live Firestore data.
                </p>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};
