'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { createClient } from '../../lib/supabaseClient';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
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

      const next = searchParams.get('next') || '/dashboard';
      setLoading(false);
      router.push(next);
      router.refresh();
    } catch (error) {
      setLoading(false);
      setMessage(error.message || 'Supabase configuration is invalid. Check your env vars and restart the app.');
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-5 shadow-lg sm:p-8">
        <div className="mb-6 text-center">
          <div className="text-2xl font-black text-brand-700">SME Tracker</div>
          <h1 className="mt-3 text-3xl font-bold text-slate-900">Welcome back</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="label">Password</label>
            <input className="input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>

          {message && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{message}</div>}

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'Signing in...' : 'Log in'}
          </button>
        </form>

        <div className="mt-5 text-center text-sm text-slate-600">
          Don’t have an account?{' '}
          <Link href="/signup" className="font-semibold text-brand-700">
            Create one
          </Link>
        </div>
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
