import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '../../../../lib/supabaseServer';
import { createSupabaseAdminClient } from '../../../../lib/supabaseAdmin';
import { getInvoiceBalance } from '../../../../lib/invoiceBalance';
import { sendInvoicePaymentReceipt } from '../../../../lib/invoiceReceipt';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const { paymentId } = await request.json();
    if (!paymentId) return NextResponse.json({ error: 'Payment ID is required.' }, { status: 400 });

    const sessionClient = createServerSupabaseClient();
    const { data: { user }, error: authError } = await sessionClient.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    const { data: profile, error: accessError } = await sessionClient
      .from('profiles')
      .select('subscription_status')
      .eq('id', user.id)
      .maybeSingle();
    if (accessError) throw new Error(`Could not verify account access: ${accessError.message}`);
    if (profile?.subscription_status !== 'active') {
      return NextResponse.json({ error: 'An active paid account is required to send payment receipts.' }, { status: 403 });
    }

    const admin = createSupabaseAdminClient();
    const { data: payment, error: paymentError } = await admin
      .from('invoice_payments')
      .select('id, invoice_id, user_id, amount, payment_date, method, reference, invoice:invoices(id, user_id, invoice_number, total, customer:customers(name, email), payments:invoice_payments(amount))')
      .eq('id', paymentId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (paymentError) throw new Error(`Could not load payment: ${paymentError.message}`);
    if (!payment?.invoice || payment.invoice.user_id !== user.id) {
      return NextResponse.json({ error: 'Payment not found.' }, { status: 404 });
    }

    const { data: businessProfile, error: profileError } = await admin
      .from('profiles')
      .select('business_name')
      .eq('id', user.id)
      .maybeSingle();
    if (profileError) throw new Error(`Could not load business profile: ${profileError.message}`);

    const { sent } = await sendInvoicePaymentReceipt(admin, {
      ...payment.invoice,
      profile: businessProfile,
      balanceRemaining: getInvoiceBalance(payment.invoice),
    }, payment);
    return NextResponse.json({ ok: sent });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Could not send payment receipt.' }, { status: 500 });
  }
}
