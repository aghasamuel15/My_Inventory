import { NextResponse } from 'next/server';
import { activateAccessPayment } from '../../../../lib/accessPayment';
import { createSupabaseAdminClient } from '../../../../lib/supabaseAdmin';
import { createServerSupabaseClient } from '../../../../lib/supabaseServer';

export const runtime = 'nodejs';

function redirectToPricing(status) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) {
    console.error('NEXT_PUBLIC_SITE_URL is missing; cannot safely redirect after payment verification.');
    return NextResponse.json({ error: 'Payment return URL is not configured.' }, { status: 503 });
  }
  const destination = new URL('/pricing', siteUrl);
  destination.searchParams.set('status', status);
  return NextResponse.redirect(destination);
}

async function verifyPayment(reference, expectedUserId) {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) throw new Error('Paystack is not configured.');

  const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  const result = await response.json();
  if (!response.ok || !result.status || result.data?.reference !== reference) {
    throw new Error(result.message || 'Paystack could not verify this payment.');
  }
  if (result.data.status !== 'success') return false;
  if (expectedUserId && result.data.metadata?.user_id !== expectedUserId) {
    throw new Error('This payment does not belong to the signed-in account.');
  }

  const admin = createSupabaseAdminClient();
  await activateAccessPayment(admin, result.data);
  return true;
}

export async function GET(request) {
  const reference = new URL(request.url).searchParams.get('reference');
  if (!reference || !/^ACCESS-[0-9a-f-]{36}$/i.test(reference)) {
    return redirectToPricing('missing_reference');
  }

  try {
    const activated = await verifyPayment(reference);
    return activated
      ? NextResponse.redirect(new URL('/dashboard?payment=success', process.env.NEXT_PUBLIC_SITE_URL))
      : redirectToPricing('payment_pending');
  } catch (error) {
    console.error('Paystack access payment verification failed:', error.message);
    return redirectToPricing('verification_failed');
  }
}

export async function POST(request) {
  try {
    const supabase = createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) throw new Error(`Could not verify your account: ${authError.message}`);
    if (!user) return NextResponse.json({ error: 'Sign in to verify this payment.' }, { status: 401 });

    const { reference } = await request.json();
    if (typeof reference !== 'string' || !/^ACCESS-[0-9a-f-]{36}$/i.test(reference)) {
      return NextResponse.json({ error: 'A valid payment reference is required.' }, { status: 400 });
    }
    const { data: payment, error: paymentError } = await supabase
      .from('access_payments')
      .select('reference')
      .eq('reference', reference)
      .eq('user_id', user.id)
      .maybeSingle();
    if (paymentError) throw new Error(`Could not find this account's payment: ${paymentError.message}`);
    if (!payment) return NextResponse.json({ error: 'Payment reference not found for this account.' }, { status: 404 });

    const activated = await verifyPayment(reference, user.id);
    return NextResponse.json({ verified: activated });
  } catch (error) {
    console.error('Paystack payment verification request failed:', error.message);
    return NextResponse.json({ error: error.message || 'Could not verify payment.' }, { status: 500 });
  }
}
