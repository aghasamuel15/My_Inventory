import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { ACCESS_PAYMENT_PURPOSE, getAccessFeeKobo } from '../../../../lib/accessPayment';
import { createSupabaseAdminClient } from '../../../../lib/supabaseAdmin';
import { createServerSupabaseClient } from '../../../../lib/supabaseServer';

export const runtime = 'nodejs';

export async function POST() {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) {
    return NextResponse.json({ error: 'Paystack is not configured.' }, { status: 503 });
  }

  try {
    const supabase = createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) throw new Error(`Could not verify your account: ${authError.message}`);
    if (!user?.id || !user.email) {
      return NextResponse.json({ error: 'Sign in with an email address before paying.' }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('subscription_status')
      .eq('id', user.id)
      .maybeSingle();
    if (profileError) throw new Error(`Could not check account access: ${profileError.message}`);
    if (profile?.subscription_status === 'active') {
      return NextResponse.json({ error: 'This account already has access.' }, { status: 409 });
    }

    const amountKobo = getAccessFeeKobo();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    if (!siteUrl) throw new Error('NEXT_PUBLIC_SITE_URL must be configured to initialize payments.');
    const baseUrl = new URL(siteUrl);
    if (baseUrl.protocol !== 'https:' && baseUrl.hostname !== 'localhost') {
      throw new Error('NEXT_PUBLIC_SITE_URL must use HTTPS.');
    }

    const admin = createSupabaseAdminClient();
    const pendingSince = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: recentPayment, error: recentPaymentError } = await admin
      .from('access_payments')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .gte('created_at', pendingSince)
      .limit(1)
      .maybeSingle();
    if (recentPaymentError) throw new Error(`Could not check recent payment attempts: ${recentPaymentError.message}`);
    if (recentPayment) {
      return NextResponse.json({ error: 'A recent payment attempt is still pending. Please complete it or try again in five minutes.' }, { status: 429 });
    }

    const reference = `ACCESS-${randomUUID()}`;
    const { error: paymentError } = await admin.from('access_payments').insert({
      user_id: user.id,
      amount: amountKobo / 100,
      reference,
      status: 'pending',
      gateway: 'paystack',
    });
    if (paymentError) throw new Error(`Could not prepare the access payment: ${paymentError.message}`);

    const callbackUrl = new URL('/api/paystack/verify', baseUrl);
    callbackUrl.searchParams.set('reference', reference);

    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: user.email,
        amount: amountKobo,
        reference,
        currency: 'NGN',
        callback_url: callbackUrl.toString(),
        metadata: {
          purpose: ACCESS_PAYMENT_PURPOSE,
          user_id: user.id,
        },
      }),
    });
    const result = await response.json();
    if (!response.ok || !result.status || !result.data?.authorization_url) {
      const message = result.message || 'Paystack could not initialize this payment.';
      const { error: failedPaymentError } = await admin
        .from('access_payments')
        .update({ status: 'failed' })
        .eq('reference', reference)
        .eq('user_id', user.id);
      if (failedPaymentError) {
        console.error('Could not mark the failed access payment:', failedPaymentError.message);
      }
      return NextResponse.json({ error: message }, { status: 502 });
    }

    return NextResponse.json({
      authorization_url: result.data.authorization_url,
      reference,
    });
  } catch (error) {
    console.error('Paystack access payment initialization failed:', error.message);
    return NextResponse.json({ error: error.message || 'Could not initialize payment.' }, { status: 500 });
  }
}
