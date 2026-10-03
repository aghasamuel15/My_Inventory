import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createSupabaseAdminClient } from '../../../../lib/supabaseAdmin';
import { verifyInvoiceLinkToken } from '../../../../lib/invoiceLink';
import { getInvoiceBalance, getInvoicePaidTotal } from '../../../../lib/invoiceBalance';
import PayInvoiceButton from '../../../../components/PayInvoiceButton';

function formatNaira(value) {
  return `₦${Number(value || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
}

export default async function PublicInvoicePaymentPage({ params }) {
  const invoiceId = verifyInvoiceLinkToken(params.token);
  if (!invoiceId) notFound();

  const supabase = createSupabaseAdminClient();
  const { data: invoice, error } = await supabase
    .from('invoices')
    .select('id, user_id, invoice_number, total, due_date, status, document_type, customer:customers(name), payments:invoice_payments(amount)')
    .eq('id', invoiceId)
    .maybeSingle();
  if (error) throw new Error(`Could not load invoice: ${error.message}`);
  if (!invoice || invoice.document_type !== 'invoice' || invoice.status === 'draft') notFound();

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('business_name')
    .eq('id', invoice.user_id)
    .maybeSingle();
  if (profileError) throw new Error(`Could not load business profile: ${profileError.message}`);

  const balance = getInvoiceBalance(invoice);

  return (
    <main className="mx-4 my-5 max-w-xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:mx-auto sm:mt-12 sm:p-8">
      <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{profile?.business_name || 'My Business'}</p>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">Invoice #{invoice.invoice_number || invoice.id}</h1>
      <p className="mt-2 text-slate-600">Billed to {invoice.customer?.name || 'Customer'}</p>
      <dl className="my-6 space-y-3 border-y border-slate-200 py-5">
        <div className="flex justify-between gap-3"><dt>Total</dt><dd className="text-right">{formatNaira(invoice.total)}</dd></div>
        <div className="flex justify-between gap-3"><dt>Paid</dt><dd className="text-right">{formatNaira(getInvoicePaidTotal(invoice))}</dd></div>
        <div className="flex justify-between gap-3 font-bold"><dt>Balance due</dt><dd className="text-right">{formatNaira(balance)}</dd></div>
        <div className="flex justify-between gap-3 text-sm text-slate-600"><dt>Due date</dt><dd className="text-right">{invoice.due_date || '—'}</dd></div>
      </dl>
      {balance > 0 ? (
        <PayInvoiceButton token={params.token} />
      ) : (
        <p className="font-semibold text-emerald-700">This invoice is fully paid. Thank you.</p>
      )}
      <p className="mt-4 text-xs text-slate-500">Payments are securely processed by Paystack. We never collect card details on this website.</p>
      <Link className="mt-5 inline-block text-sm font-medium text-brand-700 hover:underline" href={`/api/invoices/public/${encodeURIComponent(params.token)}`}>View invoice PDF</Link>
    </main>
  );
}
