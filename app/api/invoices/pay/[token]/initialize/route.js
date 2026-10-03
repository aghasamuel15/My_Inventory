import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { verifyInvoiceLinkToken } from '../../../../../../lib/invoiceLink';
import { getInvoiceBalance } from '../../../../../../lib/invoiceBalance';

export const runtime = 'nodejs';

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Invoice payment is not configured.');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function POST(_request, { params }) {
  try {
    const invoiceId = verifyInvoiceLinkToken(params.token);
    if (!invoiceId) return NextResponse.json({ error: 'This invoice link is invalid or expired.' }, { status: 404 });

    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) return NextResponse.json({ error: 'Online invoice payments are not configured.' }, { status: 503 });

    const supabase = getAdminClient();
    const { data: invoice, error } = await supabase
      .from('invoices')
      .select('id, user_id, invoice_number, total, status, document_type, customer:customers(name, email), payments:invoice_payments(amount)')
      .eq('id', invoiceId)
      .maybeSingle();
    if (error) throw new Error(`Could not load invoice: ${error.message}`);
    if (!invoice || invoice.document_type !== 'invoice' || invoice.status === 'draft') {
      return NextResponse.json({ error: 'This invoice is not available for payment.' }, { status: 404 });
    }

    const amount = Math.round(getInvoiceBalance(invoice) * 100);
    const email = invoice.customer?.email?.trim();
    if (amount <= 0) return NextResponse.json({ error: 'This invoice has no balance due.' }, { status: 409 });
    if (!email) return NextResponse.json({ error: 'The customer needs an email address before online payment can be started.' }, { status: 400 });

    const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL;
    if (!configuredUrl) return NextResponse.json({ error: 'Set NEXT_PUBLIC_SITE_URL to enable online invoice payments.' }, { status: 503 });
    const baseUrl = new URL(configuredUrl);
    if (baseUrl.protocol !== 'https:' && baseUrl.hostname !== 'localhost') {
      return NextResponse.json({ error: 'NEXT_PUBLIC_SITE_URL must use HTTPS.' }, { status: 503 });
    }

    const callback = new URL('/invoice/payment', baseUrl);
    callback.searchParams.set('token', params.token);
    const gatewayResponse = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        amount,
        reference: `PAYSTACK-${randomUUID()}`,
        currency: 'NGN',
        callback_url: callback.toString(),
        metadata: {
          invoice_id: invoice.id,
          invoice_number: invoice.invoice_number || invoice.id,
          invoice_balance_kobo: amount,
          custom_fields: [{ display_name: 'Invoice', variable_name: 'invoice_id', value: invoice.id }],
        },
      }),
    });

    const result = await gatewayResponse.json();
    if (!gatewayResponse.ok || !result.status || !result.data?.authorization_url) {
      return NextResponse.json({ error: result.message || 'Paystack could not initialize this payment.' }, { status: 502 });
    }
    return NextResponse.json({ authorizationUrl: result.data.authorization_url });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Could not start invoice payment.' }, { status: 500 });
  }
}
