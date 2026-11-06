'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { createClient } from '../../lib/supabaseClient';

function getSafeNextPath(next) {
  if (!next || !next.startsWith('/') || next.startsWith('//')) {
    return '/dashboard';
  }

  try {
    const destination = new URL(next, window.location.origin);
    if (destination.origin !== window.location.origin) {
      return '/dashboard';
    }
    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return '/dashboard';
  }
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const invitationEmail = searchParams.get('email')?.trim() || '';
  const [email, setEmail] = useState(invitationEmail);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        setMessage(error.message);
        setLoading(false);
        return;
      }

      const next = getSafeNextPath(searchParams.get('next'));
      setLoading(false);
      router.push(next);
      router.refresh();
    } catch (error) {
      setLoading(false);
      setMessage(error.message || 'Supabase configuration is invalid. Check your env vars and restart the app.');
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f5f5f0] px-4 py-8 sm:px-8 sm:py-12">
      <div className="pointer-events-none absolute -left-40 -top-32 h-[28rem] w-[28rem] rounded-full bg-[#dfe8df]/70 blur-3xl" />
      <div className="relative grid w-full max-w-5xl overflow-hidden rounded-[30px] border border-[#e1e8df] bg-white shadow-[0_32px_90px_rgba(27,56,41,0.13)] md:min-h-[590px] md:grid-cols-[0.95fr_1.05fr]">
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
            <p className="mt-20 text-[10px] font-bold uppercase tracking-[0.22em] text-[#d5c293]">A clearer way to grow</p>
            <h2 className="mt-4 max-w-sm text-4xl font-semibold leading-[1.08] tracking-[-0.06em]">Good business starts with a clear picture.</h2>
            <p className="mt-5 max-w-sm text-sm leading-7 text-white/65">Your sales, stock and finances, thoughtfully brought together.</p>
          </div>
          <div className="relative flex items-center gap-2 text-[10px] text-white/50"><span className="h-1.5 w-1.5 rounded-full bg-[#a7c7a9]" />A secure private workspace for your business</div>
        </aside>

        <section className="flex flex-col justify-center p-5 sm:p-9 md:p-10 lg:p-14">
          <Link href="/" className="mb-9 inline-flex items-center gap-2 text-xs font-semibold text-[#547064] md:hidden">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#12392e] text-[#d9bd8c]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4" aria-hidden="true"><path d="M4 18.5 8.5 8l3.5 8 3.5-6 4.5 8.5M3 21h18" /></svg>
            </span>
            SME Tracker
          </Link>
          <div className="mb-7">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#927b56]">Welcome back</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.055em] text-[#20372c]">Sign in to your account</h1>
            <p className="mt-2 text-sm text-[#738078]">Pick up right where your business left off.</p>
          </div>

          {invitationEmail && (
            <p className="mb-5 rounded-2xl border border-[#dce8df] bg-[#f1f7f1] px-4 py-3 text-sm leading-6 text-[#315d48]">
              Sign in with the invited email address to access your business.
            </p>
          )}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="label">Email address</label>
              <input className="input" type="email" autoComplete="email" required value={email} readOnly={Boolean(invitationEmail)} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="label">Password</label>
              <input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>

            {message && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{message}</div>}

            <button type="submit" disabled={loading} className="btn-primary mt-2 w-full">
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <div className="mt-7 border-t border-[#edf0eb] pt-5 text-center text-sm text-[#738078]">
            Don’t have an account?{' '}
            <Link href="/signup" className="font-semibold text-[#176b52] hover:underline">
              Create one
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Loading...</div>}>
      <LoginForm />
    </Suspense>
  );
}
