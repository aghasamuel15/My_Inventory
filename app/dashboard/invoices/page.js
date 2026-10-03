'use client';

import { useEffect, useState } from 'react';
import InvoiceCreateForm from '../../../components/InvoiceCreateForm';
import { getInvoiceBalance, getInvoicePaidTotal } from '../../../lib/invoiceBalance';
import { createClient } from '../../../lib/supabaseClient';

const formatNaira = (value) => `₦${Number(value || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;

export default function InvoicesPage() {
  const supabase = createClient();
  const [invoices, setInvoices] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      setError(authError?.message || 'Please sign in again to view invoices.');
      setLoading(false);
      return;
    }

    const [invoiceResult, customerResult] = await Promise.all([
      supabase
        .from('invoices')
        .select('*, customer:customers(name), payments:invoice_payments(amount)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase.from('customers').select('id, name').eq('user_id', user.id).order('name'),
    ]);

    if (invoiceResult.error || customerResult.error) {
      setError(invoiceResult.error?.message || customerResult.error?.message || 'Could not load invoices.');
      setLoading(false);
      return;
    }

    setInvoices(invoiceResult.data || []);
    setCustomers(customerResult.data || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const outstanding = invoices.filter((invoice) => invoice.document_type !== 'quote' && invoice.status !== 'draft')
    .reduce((sum, invoice) => sum + getInvoiceBalance(invoice), 0);
  const overdue = invoices.filter((invoice) => (
    invoice.document_type !== 'quote'
    && invoice.status !== 'draft'
    && invoice.due_date && invoice.due_date < today
    && getInvoiceBalance(invoice) > 0
  ));
  const overdueBalance = overdue.reduce((sum, invoice) => sum + getInvoiceBalance(invoice), 0);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Invoices</h1>

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <div className="card">
          <div className="text-sm text-slate-500">Outstanding balance</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">{formatNaira(outstanding)}</div>
        </div>
        <div className="card">
          <div className="text-sm text-slate-500">Overdue ({overdue.length})</div>
          <div className="mt-1 text-2xl font-bold text-red-700">{formatNaira(overdueBalance)}</div>
        </div>
      </div>

      <h2 className="mb-3 text-lg font-semibold text-slate-900">Create an invoice</h2>
      <InvoiceCreateForm customers={customers} />

      {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {loading ? (
        <div>Loading invoices...</div>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:block">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b text-slate-500">
                <th className="py-2">Customer</th>
                <th>Due date</th>
                <th>Status</th>
                <th className="text-right">Total</th>
                <th className="text-right">Balance</th>
                <th className="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => {
                const paid = getInvoicePaidTotal(invoice);
                const balance = getInvoiceBalance(invoice);
                const isQuote = invoice.document_type === 'quote';
                const isOverdue = !isQuote && invoice.due_date && invoice.due_date < today && balance > 0;
                const status = isQuote ? 'quote' : invoice.status === 'draft' ? 'draft' : balance <= 0 ? 'paid' : isOverdue ? 'overdue' : paid > 0 ? 'partial' : 'unpaid';
                return (
                  <tr key={invoice.id} className="border-b last:border-none">
                    <td className="py-2">{invoice.customer?.name || '—'}</td>
                    <td>{invoice.due_date || '—'}</td>
                    <td className={`capitalize ${isOverdue ? 'font-semibold text-red-700' : ''}`}>{status}</td>
                    <td className="text-right font-semibold">{formatNaira(invoice.total)}</td>
                    <td className="text-right">{formatNaira(balance)}</td>
                    <td className="py-2 text-right">
                      <a href={`/dashboard/invoices/${invoice.id}`} className="font-medium text-brand-700 hover:underline">
                        View
                      </a>
                    </td>
                  </tr>
                );
              })}
              {invoices.length === 0 && (
                <tr>
                  <td colSpan="6" className="py-8 text-center text-slate-400">
                    No invoices created yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
          <div className="space-y-3 md:hidden">
            {invoices.length === 0 ? (
              <div className="card text-center text-sm text-slate-500">No invoices created yet.</div>
            ) : invoices.map((invoice) => {
              const paid = getInvoicePaidTotal(invoice);
              const balance = getInvoiceBalance(invoice);
              const isQuote = invoice.document_type === 'quote';
              const isOverdue = !isQuote && invoice.due_date && invoice.due_date < today && balance > 0;
              const status = isQuote ? 'quote' : invoice.status === 'draft' ? 'draft' : balance <= 0 ? 'paid' : isOverdue ? 'overdue' : paid > 0 ? 'partial' : 'unpaid';
              return (
                <article key={invoice.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="break-words font-semibold text-slate-900">{invoice.customer?.name || 'Customer'}</h2>
                      <p className="mt-1 text-xs text-slate-500">{isQuote ? 'Quote' : 'Invoice'} · Due {invoice.due_date || 'not set'}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${isOverdue ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-700'}`}>{status}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-sm">
                    <div><div className="text-xs text-slate-500">Total</div><div className="mt-0.5 font-semibold">{formatNaira(invoice.total)}</div></div>
                    <div><div className="text-xs text-slate-500">Balance</div><div className="mt-0.5 font-semibold">{formatNaira(balance)}</div></div>
                  </div>
                  <a href={`/dashboard/invoices/${invoice.id}`} className="btn-secondary mt-3 block w-full text-center text-sm">View {isQuote ? 'quote' : 'invoice'}</a>
                </article>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
