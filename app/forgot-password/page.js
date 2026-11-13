'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getPasswordResetRedirectUrl } from '../../lib/authRedirect';
import { createClient } from '../../lib/supabaseClient';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const invitedEmail = new URLSearchParams(window.location.search).get('email')?.trim();
    if (invitedEmail) setEmail(invitedEmail);
  }, []);

  async function sendResetLink(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const supabase = createClient();
      const redirectTo = getPasswordResetRedirectUrl(window.location.origin);
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (resetError) throw resetError;
      setMessage(`If an account exists for ${email}, a password reset link has been sent. Check your inbox and spam folder.`);
    } catch (resetError) {
      setError(resetError.message || 'Could not send the password reset email.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f5f5f0] px-4 py-8 sm:px-8">
      <div className="pointer-events-none absolute -left-40 -top-32 h-[28rem] w-[28rem] rounded-full bg-[#dfe8df]/70 blur-3xl" />
      <section className="relative w-full max-w-md rounded-[28px] border border-[#e1e8df] bg-white p-6 shadow-[0_28px_80px_rgba(27,56,41,0.12)] sm:p-9">
        <Link href="/" className="inline-flex items-center gap-2 text-xs font-semibold text-[#547064]">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#12392e] text-[#d9bd8c]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4" aria-hidden="true"><path d="M4 18.5 8.5 8l3.5 8 3.5-6 4.5 8.5M3 21h18" /></svg>
          </span>
          SME Tracker
        </Link>
        <p className="mt-8 text-[10px] font-bold uppercase tracking-[0.2em] text-[#927b56]">Account recovery</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.055em] text-[#20372c]">Reset your password</h1>
        <p className="mt-2 text-sm leading-6 text-[#738078]">Enter your account email and we’ll send you a secure link to choose a new password.</p>

        <form onSubmit={sendResetLink} className="mt-6 space-y-4">
          <div>
            <label htmlFor="reset-email" className="label">Email address</label>
            <input id="reset-email" className="input" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          </div>
          {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
          {message && <p role="status" className="rounded-xl border border-[#dce8df] bg-[#f1f7f1] px-4 py-3 text-sm leading-6 text-[#315d48]">{message}</p>}
          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? 'Sending...' : 'Send reset link'}
          </button>
        </form>

        <p className="mt-6 border-t border-[#edf0eb] pt-5 text-center text-sm text-[#738078]">
          Remembered your password? <Link href="/login" className="font-semibold text-[#176b52] hover:underline">Sign in</Link>
        </p>
      </section>
    </main>
  );
}
