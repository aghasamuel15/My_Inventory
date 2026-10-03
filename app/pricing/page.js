'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createClient } from '../../lib/supabaseClient';

export default function PricingPage() {
  const [signedIn, setSignedIn] = useState(false);
  const [checkingAccount, setCheckingAccount] = useState(true);

  useEffect(() => {
    let active = true;
    createClient().auth.getUser().then(({ data: { user } }) => {
      if (!active) return;
      setSignedIn(Boolean(user));
      setCheckingAccount(false);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8">
      <section className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-lg sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-700">Testing access</p>
        <h1 className="mt-3 text-2xl font-bold text-slate-900">Payments are temporarily disabled</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          While we test the app, you can use the dashboard without completing a payment.
        </p>
        {!checkingAccount && (
          signedIn ? (
            <Link href="/dashboard" className="btn-primary mt-6 inline-flex justify-center">
              Continue to dashboard
            </Link>
          ) : (
            <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
              <Link href="/signup" className="btn-primary inline-flex justify-center">
                Create an account
              </Link>
              <Link href="/login" className="btn-secondary inline-flex justify-center">
                Sign in
              </Link>
            </div>
          )
        )}
      </section>
    </main>
  );
}
