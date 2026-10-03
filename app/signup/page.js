'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '../../lib/supabaseClient';

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({ business_name: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          data: {
            business_name: form.business_name,
          },
        },
      });

      if (error) {
        setMessage(error.message);
        setLoading(false);
        return;
      }

      if (data?.user) {
        setLoading(false);
        setMessage('Account created. Check your email to confirm your account, then sign in.');
        router.push('/login');
        return;
      }

      setLoading(false);
      setMessage('Account created. Please sign in.');
      router.push('/login');
    } catch (error) {
      setLoading(false);
      setMessage(error.message || 'Supabase configuration is invalid. Check your env vars and restart the app.');
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-lg">
        <div className="mb-6 text-center">
          <div className="text-2xl font-black text-brand-700">SME Tracker</div>
          <h1 className="mt-3 text-3xl font-bold text-slate-900">Create your account</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Business name</label>
            <input className="input" required value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <label className="label">Password</label>
            <input className="input" type="password" required minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>

          {message && <div className="rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-700">{message}</div>}

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <div className="mt-5 text-center text-sm text-slate-600">
          Already have an account?{' '}
          <Link href="/login" className="font-semibold text-brand-700">
            Log in
          </Link>
        </div>
      </div>
    </main>
  );
}
