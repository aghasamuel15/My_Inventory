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
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f5f5f0] px-4 py-8 sm:px-6 sm:py-14">
      <div className="pointer-events-none absolute -left-36 -top-32 h-[28rem] w-[28rem] rounded-full bg-[#dfe8df]/70 blur-3xl" />
      <article className="relative w-full max-w-xl overflow-hidden rounded-[28px] border border-[#e1e8df] bg-white shadow-[0_28px_80px_rgba(27,56,41,0.12)]">
        <div className="relative overflow-hidden bg-gradient-to-br from-[#163c30] via-[#12392e] to-[#0d2b22] px-5 py-7 text-white sm:px-8 sm:py-9">
          <div className="pointer-events-none absolute -right-12 -top-20 h-56 w-56 rounded-full border border-white/[0.08]" />
          <p className="relative text-[10px] font-bold uppercase tracking-[0.2em] text-[#d5c293]">{profile?.business_name || 'My Business'}</p>
          <h1 className="relative mt-3 break-words text-2xl font-semibold tracking-[-0.045em] sm:text-3xl">Invoice #{invoice.invoice_number || invoice.id}</h1>
          <p className="relative mt-2 text-sm text-white/65">Prepared for {invoice.customer?.name || 'Customer'}</p>
          <span className="relative mt-5 inline-flex rounded-full border border-white/15 bg-white/[0.08] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/80">
            {balance > 0 ? 'Payment requested' : 'Paid in full'}
          </span>
        </div>

        <div className="p-5 sm:p-8">
          <dl className="overflow-hidden rounded-2xl border border-[#e5ebe4] bg-[#fbfcfa]">
            <div className="flex justify-between gap-3 border-b border-[#e8ede7] px-4 py-3.5 text-sm sm:px-5">
              <dt className="text-[#738078]">Invoice total</dt><dd className="text-right font-medium text-[#2c4035]">{formatNaira(invoice.total)}</dd>
            </div>
            <div className="flex justify-between gap-3 border-b border-[#e8ede7] px-4 py-3.5 text-sm sm:px-5">
              <dt className="text-[#738078]">Paid so far</dt><dd className="text-right font-medium text-[#2c4035]">{formatNaira(getInvoicePaidTotal(invoice))}</dd>
            </div>
            <div className="flex justify-between gap-3 bg-[#f1f7f1] px-4 py-4 sm:px-5">
              <dt className="text-sm font-semibold text-[#315d48]">Balance due</dt><dd className="text-right text-lg font-bold tracking-[-0.035em] text-[#176b52]">{formatNaira(balance)}</dd>
            </div>
            <div className="flex justify-between gap-3 px-4 py-3.5 text-xs sm:px-5">
              <dt className="text-[#87938b]">Due date</dt><dd className="text-right text-[#68756f]">{invoice.due_date || '—'}</dd>
            </div>
          </dl>
          <div className="mt-6">
            {balance > 0 ? (
              <PayInvoiceButton token={params.token} />
            ) : (
              <p className="rounded-xl border border-[#dce8df] bg-[#f1f7f1] px-4 py-3 text-sm font-semibold text-[#315d48]">This invoice is fully paid. Thank you.</p>
            )}
          </div>
          <div className="mt-5 flex items-start gap-2 rounded-xl bg-[#f7f8f5] px-3.5 py-3 text-xs leading-5 text-[#78847c]">
            <svg viewBox="0 0 20 20" fill="none" className="mt-0.5 h-4 w-4 shrink-0 text-[#658370]" aria-hidden="true"><path d="M10 2.5 4 5v4.3c0 3.8 2.6 6.6 6 8.2 3.4-1.6 6-4.4 6-8.2V5z" stroke="currentColor" strokeWidth="1.4" /><path d="m7.5 10 1.7 1.7 3.5-3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <p>Payments are securely processed by Paystack. We never collect card details on this website.</p>
          </div>
          <Link className="mt-5 inline-flex text-sm font-semibold text-[#176b52] hover:underline" href={`/api/invoices/public/${encodeURIComponent(params.token)}`}>View invoice PDF <span className="ml-1" aria-hidden="true">→</span></Link>
        </div>
      </article>
    </main>
  );
}
