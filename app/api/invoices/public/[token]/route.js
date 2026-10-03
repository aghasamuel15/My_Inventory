import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { createInvoicePdf } from '../../../../../lib/invoicePdf';
import { verifyInvoiceLinkToken } from '../../../../../lib/invoiceLink';

export const runtime = 'nodejs';

export async function GET(_request, { params }) {
  const invoiceId = verifyInvoiceLinkToken(params.token);
  if (!invoiceId) {
    return NextResponse.json({ error: 'This invoice link is invalid or expired.' }, { status: 404 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Invoice delivery is not configured.' }, { status: 503 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: invoice, error } = await supabase
    .from('invoices')
    .select('*, customer:customers(name, email, phone, address), items:invoice_items(*), payments:invoice_payments(amount)')
    .eq('id', invoiceId)
    .maybeSingle();

  if (error || !invoice) {
    return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('business_name, business_logo_url')
    .eq('id', invoice.user_id)
    .maybeSingle();
  const { doc, filename } = await createInvoicePdf(invoice, profile);
  const pdf = new Uint8Array(doc.output('arraybuffer'));

  return new NextResponse(pdf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename.replace(/["\\]/g, '')}"`,
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}