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

  const { data: invoice, error } = await supabase
    .from('invoices')
    .select('*, customer:customers(name, phone, email), items:invoice_items(*), payments:invoice_payments(*), email_logs:invoice_email_logs(*)')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single();

  if (error || !invoice) {
    notFound();
  }

  const { data: profile } = await supabase.from('profiles').select('business_name, business_logo_url').eq('id', user.id).maybeSingle();

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
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex flex-wrap justify-start gap-3 print:hidden sm:justify-end">
        {(!isQuote && invoice.status === 'draft') ? (
          <IssueInvoiceButton invoiceId={invoice.id} />
        ) : (
          <SendInvoiceButton invoiceId={invoice.id} isQuote={isQuote} />
        )}
        <PrintButton invoice={invoice} profile={profile} />
        {!isQuote && invoice.status !== 'draft' && balance > 0 && (
          <InvoiceShareLinks
            token={publicToken}
            invoiceNumber={invoiceNumber}
            balance={balance}
            phone={invoice.customer?.phone}
          />
        )}
        {isQuote && <ConvertQuoteButton invoiceId={invoice.id} />}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-8" id="invoice-print">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">{isQuote ? 'Quote / estimate' : 'Invoice'}</div>
            <div className="mt-2 flex items-center gap-3">
              {profile?.business_logo_url && <img src={profile.business_logo_url} alt="" className="h-12 w-12 object-contain" />}
              <h1 className="text-2xl font-black text-slate-900">{profile?.business_name || 'My Business'}</h1>
            </div>
            <p className="mt-1 text-sm text-slate-500">{isQuote ? 'Quote' : 'Invoice'} #{invoiceNumber}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${overdue ? 'bg-red-50 text-red-700' : 'bg-brand-50 text-brand-700'}`}>
            {invoiceStatus}
          </span>
        </div>

        <div className="mb-8 grid gap-6 sm:grid-cols-2">
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Billed to</div>
            <div className="text-base font-semibold text-slate-900">{invoice.customer?.name || 'Customer'}</div>
            <div className="text-sm text-slate-500">{invoice.customer?.phone || '—'}</div>
            <div className="text-sm text-slate-500">{invoice.customer?.email || '—'}</div>
            <div className="text-sm text-slate-500">{invoice.customer?.address || '—'}</div>
          </div>

          <div className="sm:text-right">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Dates</div>
            <div className="text-sm text-slate-600">Issue date: {invoice.issue_date || '—'}</div>
            <div className="text-sm text-slate-600">Due date: {invoice.due_date || '—'}</div>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Description</th>
                <th className="px-4 py-3 text-right font-medium">Qty</th>
                <th className="px-4 py-3 text-right font-medium">Unit price</th>
                <th className="px-4 py-3 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {(invoice.items || []).map((item) => (
                <tr key={item.id} className="border-t border-slate-200">
                  <td className="px-4 py-3 text-slate-700">{item.description}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{Number(item.quantity || 0)}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{formatNaira(item.unit_price)}</td>
                  <td className="px-4 py-3 text-right font-medium text-slate-900">{formatNaira(item.amount)}</td>
                </tr>
              ))}
              {(!invoice.items || invoice.items.length === 0) && (
                <tr className="border-t border-slate-200">
                  <td className="px-4 py-3 text-slate-700">{invoice.description || invoice.notes || 'Invoice amount'}</td>
                  <td className="px-4 py-3 text-right text-slate-700">1</td>
                  <td className="px-4 py-3 text-right text-slate-700">{formatNaira(invoice.total)}</td>
                  <td className="px-4 py-3 text-right font-medium text-slate-900">{formatNaira(invoice.total)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-8 flex justify-end">
          <div className="w-full max-w-xs space-y-2 text-sm text-slate-700">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{formatNaira(invoice.subtotal || 0)}</span>
            </div>
            <div className="flex justify-between">
              <span>Tax</span>
              <span>{formatNaira(invoice.tax || 0)}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-900">
              <span>Total</span>
              <span>{formatNaira(invoice.total || 0)}</span>
            </div>
            <div className="flex justify-between">
              <span>Paid</span>
              <span>{formatNaira(paidTotal)}</span>
            </div>
            <div className="flex justify-between text-base font-bold text-slate-900">
              <span>Balance due</span>
              <span>{formatNaira(balance)}</span>
            </div>
          </div>
        </div>

        {invoice.notes && (
          <div className="mt-8 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Notes</div>
            {invoice.notes}
          </div>
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="mb-4 text-lg font-bold text-slate-900">{isQuote ? 'Quote actions' : 'Record a payment'}</h2>
          {isQuote ? <p className="text-sm text-slate-500">Convert this quote to an invoice when the customer approves it.</p> : invoice.status === 'draft' ? <p className="text-sm text-slate-500">Review this recurring invoice draft, then issue it before sending or recording payments.</p> : <InvoicePaymentForm invoiceId={invoice.id} balance={balance} />}
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
                    <SendReceiptButton paymentId={payment.id} />
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
            <MakeRecurringInvoiceForm invoice={invoice} />
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
