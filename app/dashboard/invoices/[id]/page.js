import { notFound } from 'next/navigation';
import PrintButton from '../../../../PrintButton';
import InvoicePaymentForm from '../../../../components/InvoicePaymentForm';
import SendInvoiceButton from '../../../../components/SendInvoiceButton';
import ConvertQuoteButton from '../../../../components/ConvertQuoteButton';
import InvoiceShareLinks from '../../../../components/InvoiceShareLinks';
import MakeRecurringInvoiceForm from '../../../../components/MakeRecurringInvoiceForm';
import IssueInvoiceButton from '../../../../components/IssueInvoiceButton';
import SendReceiptButton from '../../../../components/SendReceiptButton';
import { createInvoiceLinkToken } from '../../../../lib/invoiceLink';
import { getInvoiceBalance, getInvoicePaidTotal } from '../../../../lib/invoiceBalance';
import { getBusinessContext } from '../../../../lib/businessContext';
import { canWriteBusinessData } from '../../../../lib/businessContext';
import { createServerSupabaseClient } from '../../../../lib/supabaseServer';

function formatNaira(value) {
  return `₦${Number(value || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
}

export default async function InvoiceDetailPage({ params }) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    notFound();
  }
  const { business_id: businessId, role } = await getBusinessContext(supabase, user.id);
  const canWrite = canWriteBusinessData(role);

  const { data: invoice, error } = await supabase
    .from('invoices')
    .select('*, customer:customers(name, phone, email), items:invoice_items(*), payments:invoice_payments(*), email_logs:invoice_email_logs(*)')
    .eq('id', params.id)
    .eq('user_id', businessId)
    .single();

  if (error || !invoice) {
    notFound();
  }

  const { data: profile } = await supabase.from('profiles').select('business_name, business_logo_url').eq('id', businessId).maybeSingle();

  const invoiceNumber = invoice.invoice_number || invoice.id;
  const paidTotal = getInvoicePaidTotal(invoice);
  const balance = getInvoiceBalance(invoice);
  const today = new Date().toISOString().slice(0, 10);
  const isQuote = invoice.document_type === 'quote';
  const overdue = !isQuote && invoice.status !== 'draft' && balance > 0 && invoice.due_date && invoice.due_date < today;
  const invoiceStatus = isQuote ? 'quote' : invoice.status === 'draft' ? 'draft' : balance <= 0 ? 'paid' : overdue ? 'overdue' : paidTotal > 0 ? 'partial' : 'unpaid';
  const publicToken = createInvoiceLinkToken(invoice.id);
  const emailLogs = [...(invoice.email_logs || [])].sort((left, right) => (
    new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
  ));

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex flex-wrap justify-start gap-3 print:hidden sm:justify-end">
        {canWrite && ((!isQuote && invoice.status === 'draft') ? (
          <IssueInvoiceButton invoiceId={invoice.id} />
        ) : (
          <SendInvoiceButton invoiceId={invoice.id} isQuote={isQuote} />
        ))}
        <PrintButton invoice={invoice} profile={profile} />
        {!isQuote && invoice.status !== 'draft' && balance > 0 && (
          <InvoiceShareLinks
            token={publicToken}
            invoiceNumber={invoiceNumber}
            balance={balance}
            phone={invoice.customer?.phone}
          />
        )}
        {canWrite && isQuote && <ConvertQuoteButton invoiceId={invoice.id} />}
      </div>

      <div className="overflow-hidden rounded-[30px] border border-[#d8e3d9] bg-white shadow-[0_24px_60px_rgba(18,57,46,0.09)] ring-1 ring-[#e5ebe4]" id="invoice-print">
        <div className="bg-gradient-to-r from-[#102e25] via-[#174936] to-[#22634a] px-5 py-6 text-white sm:px-8 sm:py-7">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#d5c293]">{isQuote ? 'Quote / estimate' : 'Invoice'}</div>
              <div className="mt-3 flex items-center gap-3">
                {profile?.business_logo_url && <img src={profile.business_logo_url} alt="" className="h-12 w-12 rounded-xl border border-white/20 bg-white/10 object-contain p-1" />}
                <h1 className="text-2xl font-black tracking-[-0.05em] text-white sm:text-3xl">{profile?.business_name || 'My Business'}</h1>
              </div>
              <p className="mt-2 text-sm text-white/75">{isQuote ? 'Quote' : 'Invoice'} #{invoiceNumber}</p>
            </div>
            <span className={`inline-flex items-center rounded-full border border-white/20 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] ${overdue ? 'bg-[#a9483e]/35 text-white' : invoiceStatus === 'paid' ? 'bg-[#b8d7bb]/15 text-[#d8edda]' : 'bg-white/[0.08] text-white'}`}>
              {invoiceStatus}
            </span>
          </div>
        </div>

        <div className="space-y-8 p-4 sm:p-8">
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="rounded-[24px] border border-[#e3e9e2] bg-[#fbfcfa] p-4">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#87938b]">Billed to</div>
              <div className="text-base font-semibold text-[#20372c]">{invoice.customer?.name || 'Customer'}</div>
              <div className="mt-1 text-sm text-[#68756f]">{invoice.customer?.phone || '—'}</div>
              <div className="text-sm text-[#68756f]">{invoice.customer?.email || '—'}</div>
              <div className="text-sm text-[#68756f]">{invoice.customer?.address || '—'}</div>
            </div>

            <div className="rounded-[24px] border border-[#dce8df] bg-[#f1f7f1] p-4 sm:text-right">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#718078]">Dates</div>
              <div className="text-sm text-[#40574b]">Issue date: {invoice.issue_date || '—'}</div>
              <div className="text-sm text-[#40574b]">Due date: {invoice.due_date || '—'}</div>
            </div>
          </div>

          <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-slate-50 sm:block">
            <table className="w-full min-w-[600px] text-left text-sm">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">Description</th>
                  <th className="px-4 py-3 text-right font-semibold">Qty</th>
                  <th className="px-4 py-3 text-right font-semibold">Unit price</th>
                  <th className="px-4 py-3 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {(invoice.items || []).map((item) => (
                  <tr key={item.id} className="border-t border-slate-200 bg-white/80">
                    <td className="px-4 py-3 text-slate-700">{item.description}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{Number(item.quantity || 0)}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{formatNaira(item.unit_price)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatNaira(item.amount)}</td>
                  </tr>
                ))}
                {(!invoice.items || invoice.items.length === 0) && (
                  <tr className="border-t border-slate-200 bg-white/80">
                    <td className="px-4 py-3 text-slate-700">{invoice.description || invoice.notes || 'Invoice amount'}</td>
                    <td className="px-4 py-3 text-right text-slate-700">1</td>
                    <td className="px-4 py-3 text-right text-slate-700">{formatNaira(invoice.total)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatNaira(invoice.total)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="space-y-3 sm:hidden">
            {(invoice.items || []).map((item) => (
              <article key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <h2 className="break-words font-semibold text-slate-900">{item.description}</h2>
                <div className="mt-2 flex justify-between gap-3 text-sm text-slate-600">
                  <span>Qty {Number(item.quantity || 0)} × {formatNaira(item.unit_price)}</span>
                  <span className="shrink-0 font-semibold text-slate-900">{formatNaira(item.amount)}</span>
                </div>
              </article>
            ))}
            {(!invoice.items || invoice.items.length === 0) && (
              <article className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <h2 className="font-semibold text-slate-900">{invoice.description || invoice.notes || 'Invoice amount'}</h2>
                <div className="mt-2 flex justify-between gap-3 text-sm text-slate-600">
                  <span>Qty 1 × {formatNaira(invoice.total)}</span>
                  <span className="shrink-0 font-semibold text-slate-900">{formatNaira(invoice.total)}</span>
                </div>
              </article>
            )}
          </div>

          <div className="flex justify-end">
            <div className="w-full max-w-sm rounded-[24px] border border-[#e3e9e2] bg-gradient-to-br from-[#f7f8f5] via-white to-[#f1f7f1] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
              <div className="space-y-2.5 text-sm text-slate-700">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>{formatNaira(invoice.subtotal || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Tax</span>
                  <span>{formatNaira(invoice.tax || 0)}</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-3 text-base font-bold text-slate-900">
                  <span>Total</span>
                  <span className="tracking-[-0.04em]">{formatNaira(invoice.total || 0)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Paid</span>
                  <span>{formatNaira(paidTotal)}</span>
                </div>
                <div className="flex justify-between rounded-2xl bg-emerald-100 px-3 py-2 text-base font-black text-emerald-900">
                  <span>Balance due</span>
                  <span className="tracking-[-0.04em]">{formatNaira(balance)}</span>
                </div>
              </div>
            </div>
          </div>

          {invoice.notes && (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-amber-50/60 p-4 text-sm text-slate-700">
              <div className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Notes</div>
              {invoice.notes}
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="mb-4 text-lg font-bold text-slate-900">{isQuote ? 'Quote actions' : 'Record a payment'}</h2>
          {!canWrite
            ? <p className="text-sm text-slate-500">This account has read-only access.</p>
            : isQuote
              ? <p className="text-sm text-slate-500">Convert this quote to an invoice when the customer approves it.</p>
              : invoice.status === 'draft'
                ? <p className="text-sm text-slate-500">Review this recurring invoice draft, then issue it before sending or recording payments.</p>
                : <InvoicePaymentForm invoiceId={invoice.id} balance={balance} />}
        </section>
        <section className="card">
          <h2 className="mb-4 text-lg font-bold text-slate-900">Payment history</h2>
          {(invoice.payments || []).length === 0 ? (
            <p className="text-sm text-slate-500">No payments recorded.</p>
          ) : (
            <div className="space-y-3">
              {[...(invoice.payments || [])].sort((left, right) => (
                new Date(right.payment_date).getTime() - new Date(left.payment_date).getTime()
              )).map((payment) => (
                <div key={payment.id} className="flex flex-wrap justify-between gap-2 border-b border-slate-100 pb-3 last:border-0">
                  <div>
                    <div className="font-medium text-slate-800">{formatNaira(payment.amount)}</div>
                    <div className="text-xs capitalize text-slate-500">
                      {(payment.method || 'other').replace('_', ' ')} · {payment.payment_date}
                      {payment.reference ? ` · ${payment.reference}` : ''}
                    </div>
                    {payment.notes && <div className="mt-1 text-xs text-slate-500">{payment.notes}</div>}
                    {canWrite && <SendReceiptButton paymentId={payment.id} />}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {!isQuote && invoice.status !== 'draft' && (
        <section className="card mt-6">
          <h2 className="mb-2 text-lg font-bold text-slate-900">Recurring schedule</h2>
          {invoice.recurring_template_id ? (
            <p className="text-sm text-slate-600">This invoice was created from a recurring schedule.</p>
          ) : (
            canWrite ? <MakeRecurringInvoiceForm invoice={invoice} /> : null
          )}
        </section>
      )}

      <section className="card mt-6">
        <h2 className="mb-4 text-lg font-bold text-slate-900">Email history</h2>
        {emailLogs.length === 0 ? (
          <p className="text-sm text-slate-500">No invoice emails or reminders have been recorded.</p>
        ) : (
          <div className="space-y-3">
            {emailLogs.map((log) => (
              <div key={log.id} className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3 last:border-0">
                <div>
                  <div className="font-medium capitalize text-slate-800">
                    {log.email_type === 'reminder' ? 'Overdue reminder' : log.email_type === 'receipt' ? 'Payment receipt' : isQuote ? 'Quote email' : 'Invoice email'}
                    <span className={`ml-2 text-xs uppercase ${log.status === 'sent' ? 'text-emerald-700' : log.status === 'failed' ? 'text-red-700' : 'text-amber-700'}`}>
                      {log.status}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500">{log.recipient} · {new Date(log.created_at).toLocaleString()}</div>
                  {log.error && <p className="mt-1 text-xs text-red-700">{log.error}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
