import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { verifyInvoiceLinkToken } from '../../../../../lib/invoiceLink';
import { getInvoiceBalance, getInvoicePaidTotal } from '../../../../../lib/invoiceBalance';
import { sendInvoicePaymentReceipt } from '../../../../../lib/invoiceReceipt';

export const runtime = 'nodejs';

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Invoice payment is not configured.');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function POST(request) {
  try {
    const { token, reference } = await request.json();
    const invoiceId = verifyInvoiceLinkToken(token);
    if (!invoiceId) return NextResponse.json({ error: 'This invoice link is invalid or expired.' }, { status: 404 });
    if (typeof reference !== 'string' || !reference.startsWith('PAYSTACK-')) {
      return NextResponse.json({ error: 'Invalid payment reference.' }, { status: 400 });
    }

    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) return NextResponse.json({ error: 'Online invoice payments are not configured.' }, { status: 503 });
    const supabase = getAdminClient();
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('id, user_id, invoice_number, total, status, document_type, customer:customers(name, email), payments:invoice_payments(amount)')
      .eq('id', invoiceId)
      .maybeSingle();
    if (invoiceError) throw new Error(`Could not load invoice: ${invoiceError.message}`);
    if (!invoice || invoice.document_type !== 'invoice') {
      return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });
    }

    let { data: payment, error: paymentError } = await supabase
      .from('invoice_payments')
      .select('id, invoice_id, user_id, amount, payment_date, method, reference')
      .eq('reference', reference)
      .maybeSingle();
    if (paymentError) throw new Error(`Could not check payment history: ${paymentError.message}`);

    if (!payment) {
      const gatewayResponse = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
        headers: { Authorization: `Bearer ${secretKey}` },
      });
      const result = await gatewayResponse.json();
      const transaction = result.data;
      if (
        !gatewayResponse.ok
        || !result.status
        || transaction?.status !== 'success'
        || transaction.reference !== reference
        || transaction.currency !== 'NGN'
        || transaction.metadata?.invoice_id !== invoice.id
        || Number(transaction.metadata?.invoice_balance_kobo) !== transaction.amount
        || transaction.customer?.email?.trim().toLowerCase() !== invoice.customer?.email?.trim().toLowerCase()
      ) {
        return NextResponse.json({ error: result.message || 'Paystack has not confirmed this invoice payment.' }, { status: 402 });
      }

      if (!Number.isInteger(transaction.amount) || transaction.amount <= 0) {
        return NextResponse.json({ error: 'Paystack returned an invalid payment amount.' }, { status: 409 });
      }

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
        throw new Error(`Paystack confirmed payment, but it could not be recorded: ${insertError.message}`);
      } else {
        payment = insertedPayment;
      }
    }

    if (!payment || payment.invoice_id !== invoice.id || payment.user_id !== invoice.user_id) {
      return NextResponse.json({ error: 'Payment reference does not belong to this invoice.' }, { status: 409 });
    }

    const { data: latestInvoice, error: latestInvoiceError } = await supabase
      .from('invoices')
      .select('id, user_id, invoice_number, total, customer:customers(name, email), payments:invoice_payments(amount)')
      .eq('id', invoice.id)
      .single();
    if (latestInvoiceError) throw new Error(`Payment was recorded but the balance could not be refreshed: ${latestInvoiceError.message}`);
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('business_name')
      .eq('id', invoice.user_id)
      .maybeSingle();
    if (profileError) throw new Error(`Payment was recorded but the receipt could not be prepared: ${profileError.message}`);

    const overpayment = Math.max(0, getInvoicePaidTotal(latestInvoice) - Number(latestInvoice.total || 0));
    try {
      await sendInvoicePaymentReceipt(supabase, {
        ...latestInvoice,
        profile,
        balanceRemaining: getInvoiceBalance(latestInvoice),
      }, payment);
    } catch (receiptError) {
      return NextResponse.json({
        ok: true,
        overpayment,
        receiptError: receiptError.message || 'Payment succeeded, but the receipt email failed.',
      });
    }

    return NextResponse.json({ ok: true, overpayment });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Could not verify invoice payment.' }, { status: 500 });
  }
}
