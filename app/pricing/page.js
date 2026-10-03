'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '../../lib/supabaseClient';

export default function PricingPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [signedIn, setSignedIn] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);
  const [checkingAccount, setCheckingAccount] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [paymentMessage, setPaymentMessage] = useState('');

  useEffect(() => {
    let active = true;
    const paymentStatus = new URLSearchParams(window.location.search).get('status');
    if (paymentStatus === 'payment_pending') {
      setPaymentMessage('Payment is still processing. Access will be enabled after Paystack confirms it.');
    } else if (paymentStatus === 'verification_failed') {
      setPaymentMessage('We could not verify the payment yet. If you were charged, contact support before paying again.');
    } else if (paymentStatus === 'payment_required') {
      setPaymentMessage('Complete the one-time access payment to use the dashboard.');
    } else if (paymentStatus === 'access_check_failed') {
      setPaymentMessage('We could not check your account access. Please refresh or contact support.');
    } else if (paymentStatus === 'missing_reference') {
      setPaymentMessage('The payment return did not include a valid reference.');
    }

    async function checkAccount() {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (!active) return;
      if (authError) {
        setError(authError.message || 'Could not verify your sign-in.');
        setCheckingAccount(false);
        return;
      }
      setSignedIn(Boolean(user));
      if (user) {
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('subscription_status')
          .eq('id', user.id)
          .maybeSingle();
        if (!active) return;
        if (profileError) setError(profileError.message || 'Could not check account access.');
        if (profile?.subscription_status === 'active') setHasAccess(true);
      }
      setCheckingAccount(false);
    }

    checkAccount();
    return () => {
      active = false;
    };
  }, [supabase]);

  async function handlePay() {
    setLoading(true);
    setError('');

    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw new Error(authError.message || 'Could not verify your sign-in.');
      if (!user) {
        router.push('/login?next=%2Fpricing');
        return;
      }

      const response = await fetch('/api/paystack/initialize', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not start payment. Please try again.');

      const checkoutUrl = new URL(data.authorization_url);
      if (checkoutUrl.protocol !== 'https:' || checkoutUrl.hostname !== 'checkout.paystack.com') {
        throw new Error('Paystack returned an invalid checkout address.');
      }
      window.location.assign(checkoutUrl.toString());
    } catch (paymentError) {
      setError(paymentError.message || 'Could not start payment. Please try again.');
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl items-center justify-center px-4 py-8 sm:px-6 sm:py-16">
      <div className="w-full rounded-3xl border border-slate-200 bg-white p-5 shadow-lg sm:p-8">
        <div className="text-center">
          <div className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-700">Access</div>
          <h1 className="mt-3 text-3xl font-black text-slate-900 sm:text-4xl">Unlock the full SME dashboard</h1>
          <p className="mt-4 text-slate-600">
            Pay a one-time access fee and start tracking your finances immediately.
          </p>
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-6">
            <div className="text-sm text-slate-500">Single access fee</div>
            <div className="mt-3 text-4xl font-black text-brand-700">₦5,000</div>
            <ul className="mt-5 space-y-2 text-sm text-slate-600">
              <li>• Sales tracking</li>
              <li>• Expense logging</li>
              <li>• Customer debt management</li>
              <li>• Invoice generation</li>
              <li>• Daily and weekly profit insights</li>
              <li>• Export reports</li>
            </ul>
          </div>

          <div className="rounded-2xl border border-slate-200 p-4 sm:p-6">
            <div className="text-lg font-semibold text-slate-800">Secure Paystack checkout</div>
            <p className="mt-2 text-sm text-slate-600">
              Access is enabled only after the server verifies a successful ₦5,000 payment for your signed-in account.
            </p>

            {paymentMessage && <p role="status" className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{paymentMessage}</p>}
            {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

            {hasAccess ? (
              <Link href="/dashboard" className="mt-6 inline-flex rounded-full bg-brand-600 px-5 py-3 font-semibold text-white hover:bg-brand-700">
                Go to dashboard
              </Link>
            ) : signedIn ? (
              <button type="button" onClick={handlePay} disabled={loading || checkingAccount} className="btn-primary mt-6 w-full">
                {loading ? 'Redirecting to Paystack...' : 'Pay with Paystack'}
              </button>
            ) : (
              <div className="mt-6 flex flex-col gap-3">
                <Link href="/signup" className="inline-flex justify-center rounded-full bg-brand-600 px-5 py-3 font-semibold text-white hover:bg-brand-700">
                  Create an account to continue
                </Link>
                <Link href="/login?next=%2Fpricing" className="text-center text-sm font-semibold text-brand-700">
                  Already registered? Sign in
                </Link>
              </div>
            )}
            {checkingAccount && <p className="mt-3 text-center text-xs text-slate-500">Checking account access...</p>}
          </div>
        </div>
      </div>
    </main>
  );
}
