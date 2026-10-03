import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '../../../../lib/supabaseAdmin';
import { getInvoiceBalance } from '../../../../lib/invoiceBalance';
import { sendInvoicePaymentReceipt } from '../../../../lib/invoiceReceipt';

export const runtime = 'nodejs';

function isValidSignature(body, signature, secret) {
  if (typeof signature !== 'string' || !/^[a-f0-9]{128}$/i.test(signature)) return false;
  const expected = createHmac('sha512', secret).update(body).digest();
  const provided = Buffer.from(signature, 'hex');
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export async function POST(request) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return NextResponse.json({ error: 'Paystack webhook is not configured.' }, { status: 503 });

  const body = await request.text();
  if (!isValidSignature(body, request.headers.get('x-paystack-signature'), secret)) {
    return NextResponse.json({ error: 'Invalid webhook signature.' }, { status: 401 });
  }

  let event;
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Invalid webhook payload.' }, { status: 400 });
  }
  if (event.event !== 'charge.success') return NextResponse.json({ ok: true, ignored: true });

  const transaction = event.data;
  const invoiceId = transaction?.metadata?.invoice_id;
  const reference = transaction?.reference;
  if (typeof invoiceId !== 'string' || typeof reference !== 'string' || !reference.startsWith('PAYSTACK-')) {
    return NextResponse.json({ error: 'Invoice payment metadata is invalid.' }, { status: 400 });
  }
  if (
    transaction.status !== 'success'
    || transaction.currency !== 'NGN'
    || !Number.isInteger(transaction.amount)
    || transaction.amount <= 0
    || Number(transaction.metadata.invoice_balance_kobo) !== transaction.amount
  ) {
    return NextResponse.json({ error: 'Payment details could not be validated.' }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('id, user_id, invoice_number, total, status, document_type, customer:customers(name, email), payments:invoice_payments(amount)')
      .eq('id', invoiceId)
      .maybeSingle();
    if (invoiceError) throw new Error(`Could not load invoice: ${invoiceError.message}`);
    if (!invoice || invoice.document_type !== 'invoice' || invoice.status === 'draft') {
      return NextResponse.json({ error: 'Invoice is not available for payment.' }, { status: 404 });
    }
    if (transaction.customer?.email?.trim().toLowerCase() !== invoice.customer?.email?.trim().toLowerCase()) {
      return NextResponse.json({ error: 'Payment customer does not match this invoice.' }, { status: 400 });
    }

    let { data: payment, error: paymentError } = await supabase
      .from('invoice_payments')
      .select('id, invoice_id, user_id, amount, payment_date, method, reference')
      .eq('reference', reference)
      .maybeSingle();
    if (paymentError) throw new Error(`Could not check payment history: ${paymentError.message}`);

    if (!payment) {
      const { data: insertedPayment, error: insertError } = await supabase
        .from('invoice_payments')
        .insert({
          invoice_id: invoice.id,
          user_id: invoice.user_id,
          amount: transaction.amount / 100,
          payment_date: new Date().toISOString().slice(0, 10),
          method: 'card',
          reference,
          notes: 'Paid online through Paystack',
        })
        .select('id, invoice_id, user_id, amount, payment_date, method, reference')
        .single();
      if (insertError?.code === '23505') {
        const existing = await supabase.from('invoice_payments')
          .select('id, invoice_id, user_id, amount, payment_date, method, reference')
          .eq('reference', reference)
          .maybeSingle();
        if (existing.error) throw new Error(existing.error.message);
        payment = existing.data;
      } else if (insertError) {
        throw new Error(`Confirmed payment could not be recorded: ${insertError.message}`);
      } else {
        payment = insertedPayment;
      }
    }
    if (!payment || payment.invoice_id !== invoice.id || payment.user_id !== invoice.user_id) {
      return NextResponse.json({ error: 'Payment reference does not belong to this invoice.' }, { status: 409 });
    }

    const { data: latestInvoice, error: latestError } = await supabase
      .from('invoices')
      .select('id, user_id, invoice_number, total, customer:customers(name, email), payments:invoice_payments(amount)')
      .eq('id', invoice.id)
      .single();
    if (latestError) throw new Error(`Payment was recorded but the invoice could not be refreshed: ${latestError.message}`);
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('business_name')
      .eq('id', invoice.user_id)
      .maybeSingle();
    if (profileError) throw new Error(`Payment was recorded but the receipt could not be prepared: ${profileError.message}`);

    try {
      await sendInvoicePaymentReceipt(supabase, {
        ...latestInvoice,
        profile,
        balanceRemaining: getInvoiceBalance(latestInvoice),
      }, payment);
    } catch (receiptError) {
      console.error(`Payment ${payment.id} was recorded but the receipt email failed:`, receiptError.message);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Paystack invoice webhook processing failed:', error.message);
    return NextResponse.json({ error: 'Payment webhook processing failed.' }, { status: 500 });
  }
}
