'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import PasswordInput from '../../components/PasswordInput';
import { createClient } from '../../lib/supabaseClient';

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({ business_name: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [invitationEmail, setInvitationEmail] = useState('');
  const [confirmationRequired, setConfirmationRequired] = useState(false);

  useEffect(() => {
    const invitedEmail = new URLSearchParams(window.location.search).get('email')?.trim() || '';
    if (!invitedEmail) return;
    setInvitationEmail(invitedEmail);
    setForm((current) => ({ ...current, email: invitedEmail }));
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const supabase = createClient();
      const emailRedirectTo = new URL('/auth/callback?next=%2Fdashboard', window.location.origin).toString();
      const { data, error } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          data: { business_name: form.business_name },
          emailRedirectTo,
        },
      });

      if (error) {
        setMessage(error.message);
        setLoading(false);
        return;
      }

      if (data?.user) {
        if (data.session) {
          router.replace('/dashboard');
          router.refresh();
          return;
        }

        setLoading(false);
        setConfirmationRequired(true);
        setMessage(`Account created. Check ${form.email} and click the confirmation link to open your dashboard.`);
        return;
      }

      setLoading(false);
      setMessage('Account created. Please sign in.');
    } catch (error) {
      setLoading(false);
      setMessage(error.message || 'Supabase configuration is invalid. Check your env vars and restart the app.');
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f5f5f0] px-4 py-8 sm:px-8 sm:py-12">
      <div className="pointer-events-none absolute -right-40 -top-32 h-[28rem] w-[28rem] rounded-full bg-[#dfe8df]/70 blur-3xl" />
      <div className="relative grid w-full max-w-5xl overflow-hidden rounded-[30px] border border-[#e1e8df] bg-white shadow-[0_32px_90px_rgba(27,56,41,0.13)] md:min-h-[620px] md:grid-cols-[0.95fr_1.05fr]">
        <aside className="relative hidden overflow-hidden bg-gradient-to-br from-[#163c30] via-[#12392e] to-[#0d2b22] p-10 text-white md:flex md:flex-col md:justify-between lg:p-12">
          <div className="pointer-events-none absolute -right-28 -top-20 h-80 w-80 rounded-full border border-white/[0.08]" />
          <div className="pointer-events-none absolute -right-10 top-4 h-48 w-48 rounded-full border border-white/[0.08]" />
          <div className="relative">
            <Link href="/" className="inline-flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#d1b27b]/40 bg-white/[0.06] text-[#d9bd8c]">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-5 w-5" aria-hidden="true"><path d="M4 18.5 8.5 8l3.5 8 3.5-6 4.5 8.5M3 21h18" /></svg>
              </span>
              <span className="text-sm font-bold tracking-wide">SME Tracker</span>
            </Link>
            <p className="mt-20 text-[10px] font-bold uppercase tracking-[0.22em] text-[#d5c293]">Start with confidence</p>
            <h2 className="mt-4 max-w-sm text-4xl font-semibold leading-[1.08] tracking-[-0.06em]">A more composed way to run your business.</h2>
            <p className="mt-5 max-w-sm text-sm leading-7 text-white/65">Set up your private workspace and bring the important details into focus.</p>
          </div>
          <div className="relative space-y-3">
            {['Track sales and expenses', 'Keep stock and customer records', 'Send clear invoices and receipts'].map((item) => (
              <div key={item} className="flex items-center gap-2 text-xs text-white/70">
                <span className="flex h-5 w-5 items-center justify-center rounded-full border border-[#d1b27b]/40 text-[#d9bd8c]">✓</span>
                {item}
              </div>
            ))}
          </div>
        </aside>

        <section className="flex flex-col justify-center p-5 sm:p-9 md:p-10 lg:p-14">
          <Link href="/" className="mb-8 inline-flex items-center gap-2 text-xs font-semibold text-[#547064] md:hidden">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#12392e] text-[#d9bd8c]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4" aria-hidden="true"><path d="M4 18.5 8.5 8l3.5 8 3.5-6 4.5 8.5M3 21h18" /></svg>
            </span>
            SME Tracker
          </Link>
          <div className="mb-6">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#927b56]">
              {confirmationRequired ? 'One last step' : 'Let’s get started'}
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.055em] text-[#20372c]">
              {confirmationRequired ? 'Check your email' : 'Create your account'}
            </h1>
            <p className="mt-2 text-sm text-[#738078]">
              {confirmationRequired ? 'Confirm your email address to continue to your dashboard.' : 'A few details, then your workspace is ready.'}
            </p>
          </div>

          {!confirmationRequired && invitationEmail && (
            <p className="mb-4 rounded-2xl border border-[#dce8df] bg-[#f1f7f1] px-4 py-3 text-sm leading-6 text-[#315d48]">
              You’re joining a business on SME Tracker. Use the invited email address to activate the role selected by the business Admin. Admin access is reserved for the first account that creates a business.
            </p>
          )}
          {!confirmationRequired && !invitationEmail && (
            <p className="mb-4 rounded-2xl border border-[#dce8df] bg-[#f1f7f1] px-4 py-3 text-sm leading-6 text-[#315d48]">
              The first account becomes the business Admin with full access. Teammates can be invited later as Manager, Staff, or Viewer.
            </p>
          )}
          {!confirmationRequired && <form onSubmit={handleSubmit} className="space-y-4">
            {!invitationEmail && (
              <div>
                <label className="label">Business name</label>
                <input className="input" autoComplete="organization" required value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} />
              </div>
            )}
            <div>
              <label className="label">Email address</label>
              <input className="input" type="email" autoComplete="email" required value={form.email} readOnly={Boolean(invitationEmail)} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="password">Password</label>
              <PasswordInput
                id="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
              />
            </div>

            {message && <div role="status" className="rounded-xl border border-[#dce8df] bg-[#f3f7f3] px-4 py-3 text-sm leading-6 text-[#315d48]">{message}</div>}

            <button type="submit" disabled={loading} className="btn-primary mt-2 w-full">
              {loading ? 'Creating account...' : 'Create account'}
            </button>
          </form>}

          {confirmationRequired && message && (
            <div role="status" className="rounded-xl border border-[#dce8df] bg-[#f3f7f3] px-4 py-3 text-sm leading-6 text-[#315d48]">{message}</div>
          )}

          <div className="mt-6 border-t border-[#edf0eb] pt-5 text-center text-sm text-[#738078]">
            Already have an account?{' '}
            <Link href="/login" className="font-semibold text-[#176b52] hover:underline">
              Sign in
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
