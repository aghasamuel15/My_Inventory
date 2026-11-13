'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PasswordInput from '../../components/PasswordInput';
import { createClient } from '../../lib/supabaseClient';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [checkingLink, setCheckingLink] = useState(true);
  const [validLink, setValidLink] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    supabase.auth.getSession()
      .then(({ data, error: sessionError }) => {
        if (!active) return;
        if (sessionError) setError(`Could not verify the reset link: ${sessionError.message}`);
        setValidLink(Boolean(data.session));
        setCheckingLink(false);
      })
      .catch((sessionError) => {
        if (!active) return;
        setError(`Could not verify the reset link: ${sessionError.message || 'Please try again.'}`);
        setCheckingLink(false);
      });
    return () => { active = false; };
  }, [supabase]);

  async function updatePassword(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    if (password.length < 8) {
      setError('Choose a password with at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }

    setSaving(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setMessage('Your password has been reset. You can now sign in with your new password.');
    setPassword('');
    setConfirmPassword('');
    window.setTimeout(() => router.replace('/login'), 1800);
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f5f5f0] px-4 py-8 sm:px-8">
      <div className="pointer-events-none absolute -right-40 -top-32 h-[28rem] w-[28rem] rounded-full bg-[#dfe8df]/70 blur-3xl" />
      <section className="relative w-full max-w-md rounded-[28px] border border-[#e1e8df] bg-white p-6 shadow-[0_28px_80px_rgba(27,56,41,0.12)] sm:p-9">
        <Link href="/" className="inline-flex items-center gap-2 text-xs font-semibold text-[#547064]">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#12392e] text-[#d9bd8c]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4" aria-hidden="true"><path d="M4 18.5 8.5 8l3.5 8 3.5-6 4.5 8.5M3 21h18" /></svg>
          </span>
          SME Tracker
        </Link>
        <p className="mt-8 text-[10px] font-bold uppercase tracking-[0.2em] text-[#927b56]">Account security</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.055em] text-[#20372c]">Choose a new password</h1>

        {checkingLink ? (
          <p role="status" className="mt-5 text-sm text-[#738078]">Verifying your secure reset link…</p>
        ) : !validLink ? (
          <div className="mt-5 rounded-2xl border border-[#f0dfc0] bg-[#fbf6eb] p-4 text-sm leading-6 text-[#805f2f]">
            {error || 'This password reset link is invalid or has expired. Request a new link to continue.'}
            <Link href="/forgot-password" className="mt-3 inline-flex font-semibold underline">Request a new link</Link>
          </div>
        ) : (
          <form onSubmit={updatePassword} className="mt-6 space-y-4">
            <div>
              <label htmlFor="new-password" className="label">New password</label>
              <PasswordInput
                id="new-password"
                autoComplete="new-password"
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            <div>
              <label htmlFor="confirm-password" className="label">Confirm new password</label>
              <PasswordInput
                id="confirm-password"
                autoComplete="new-password"
                minLength={8}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </div>
            {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
            {message && <p role="status" className="rounded-xl border border-[#dce8df] bg-[#f1f7f1] px-4 py-3 text-sm text-[#315d48]">{message}</p>}
            <button type="submit" className="btn-primary w-full" disabled={saving}>
              {saving ? 'Updating...' : 'Reset password'}
            </button>
          </form>
        )}

        {!validLink && !checkingLink && (
          <p className="mt-6 border-t border-[#edf0eb] pt-5 text-center text-sm text-[#738078]">
            <Link href="/login" className="font-semibold text-[#176b52] hover:underline">Back to sign in</Link>
          </p>
        )}
      </section>
    </main>
  );
}
