import Link from 'next/link';
import { notFound } from 'next/navigation';
import PrintStatementButton from '../../../../../components/PrintStatementButton';
import { getInvoiceBalance, getInvoicePaidTotal } from '../../../../../lib/invoiceBalance';
import { createServerSupabaseClient } from '../../../../../lib/supabaseServer';

function formatNaira(value) {
  return `₦${Number(value || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
}

export default async function CustomerStatementPage({ params }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data: customer, error: customerError } = await supabase
    .from('customers')
    .select('id, name, email, phone, address')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (customerError) throw new Error(`Could not load customer: ${customerError.message}`);
  if (!customer) notFound();

  const { data: invoices, error: invoicesError } = await supabase
    .from('invoices')
    .select('id, invoice_number, issue_date, due_date, total, status, document_type, payments:invoice_payments(amount, payment_date, method, reference)')
    .eq('customer_id', customer.id)
    .eq('user_id', user.id)
    .eq('document_type', 'invoice')
    .neq('status', 'draft')
    .order('issue_date', { ascending: false });
  if (invoicesError) throw new Error(`Could not load customer invoices: ${invoicesError.message}`);

  const invoiced = (invoices || []).reduce((sum, invoice) => sum + Number(invoice.total || 0), 0);
  const paid = (invoices || []).reduce((sum, invoice) => sum + getInvoicePaidTotal(invoice), 0);
  const balance = (invoices || []).reduce((sum, invoice) => sum + getInvoiceBalance(invoice), 0);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/dashboard/customers" className="text-sm font-medium text-brand-700 hover:underline">Back to customers</Link>
        <PrintStatementButton />
      </div>
      <section className="card">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Customer statement</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">{customer.name}</h1>
        <p className="mt-1 text-sm text-slate-600">{[customer.email, customer.phone, customer.address].filter(Boolean).join(' · ')}</p>
        <p className="mt-1 text-xs text-slate-500">Generated {new Date().toLocaleDateString('en-NG')}</p>

        <div className="my-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">Invoiced</div><div className="font-bold">{formatNaira(invoiced)}</div></div>
          <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">Paid</div><div className="font-bold text-emerald-700">{formatNaira(paid)}</div></div>
          <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">Balance due</div><div className="font-bold text-red-700">{formatNaira(balance)}</div></div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b text-slate-500"><th className="py-2">Date</th><th>Activity</th><th>Reference</th><th className="text-right">Amount</th></tr></thead>
            <tbody>
              {(invoices || []).flatMap((invoice) => {
                const entries = [{
                  key: `${invoice.id}-invoice`,
                  date: invoice.issue_date,
                  activity: `Invoice #${invoice.invoice_number || invoice.id}`,
                  reference: invoice.due_date ? `Due ${invoice.due_date}` : '—',
                  amount: Number(invoice.total || 0),
                }];
                for (const payment of invoice.payments || []) {
                  entries.push({
                    key: `${invoice.id}-${payment.reference || payment.payment_date}-${payment.amount}`,
                    date: payment.payment_date,
                    activity: `Payment (${(payment.method || 'other').replace('_', ' ')})`,
                    reference: payment.reference || '—',
                    amount: -Number(payment.amount || 0),
                  });
                }
                return entries;
              }).sort((left, right) => String(right.date || '').localeCompare(String(left.date || ''))).map((entry) => (
                <tr key={entry.key} className="border-b last:border-0">
                  <td className="py-2">{entry.date || '—'}</td>
                  <td>{entry.activity}</td>
                  <td>{entry.reference}</td>
                  <td className={`text-right font-medium ${entry.amount < 0 ? 'text-emerald-700' : ''}`}>{formatNaira(entry.amount)}</td>
                </tr>
              ))}
              {(!invoices || invoices.length === 0) && <tr><td colSpan="4" className="py-6 text-center text-slate-500">No issued invoices for this customer.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
