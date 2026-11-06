'use client';

import { useEffect, useState } from 'react';
import InvoiceCreateForm from '../../../components/InvoiceCreateForm';
import { getInvoiceBalance, getInvoicePaidTotal } from '../../../lib/invoiceBalance';
import { createClient } from '../../../lib/supabaseClient';
import { canWriteBusinessData, getBusinessContext } from '../../../lib/businessContext';

const formatNaira = (value) => `₦${Number(value || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;

export default function InvoicesPage() {
  const supabase = createClient();
  const [invoices, setInvoices] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [markingPaidId, setMarkingPaidId] = useState('');
  const [businessRole, setBusinessRole] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    setStatusMessage('');
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      setError(authError?.message || 'Please sign in again to view invoices.');
      setLoading(false);
      return;
    }
    const context = await getBusinessContext(supabase, user.id);
    const { business_id: businessId } = context;
    setBusinessRole(context.role);

    const [invoiceResult, customerResult] = await Promise.all([
      supabase
        .from('invoices')
        .select('*, customer:customers(name), payments:invoice_payments(amount)')
        .eq('user_id', businessId)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase.from('customers').select('id, name').eq('user_id', businessId).order('name'),
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

  async function markInvoiceAsPaid(invoiceId, balance) {
    if (!balance || balance <= 0) return;

    const confirmed = window.confirm(`Mark this invoice as fully paid for ${formatNaira(balance)} and email the customer a receipt?`);
    if (!confirmed) return;

    setMarkingPaidId(invoiceId);
    setError('');
    setStatusMessage('');

    try {
      const { data: paymentId, error: paymentError } = await supabase.rpc('record_invoice_payment', {
        p_invoice_id: invoiceId,
        p_amount: Number(balance),
        p_payment_date: new Date().toISOString().slice(0, 10),
        p_method: 'other',
        p_reference: 'AUTO-PAID',
        p_notes: 'Marked paid from invoice list',
      });

      if (paymentError) throw new Error(paymentError.message || 'Could not record payment.');
      if (!paymentId) throw new Error('Payment was recorded but the receipt could not be created.');

      const response = await fetch('/api/invoices/receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Payment was recorded, but the receipt could not be emailed.');
      }

      setStatusMessage('Invoice marked paid and the customer receipt has been sent.');
      await load();
    } catch (markError) {
      setError(markError.message || 'Could not finish marking the invoice as paid.');
    } finally {
      setMarkingPaidId('');
    }
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
    <div className="space-y-6">
      <div className="rounded-[30px] border border-violet-200 bg-gradient-to-r from-slate-950 via-violet-900 to-indigo-800 p-5 text-white shadow-[0_22px_44px_rgba(79,70,229,0.18)] sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-violet-200">Financial overview</p>
            <h1 className="mt-2 text-2xl font-black tracking-[-0.04em] sm:text-3xl">Invoices</h1>
          </div>
          <div className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-3 py-2 text-sm font-medium text-violet-50">
            {invoices.length} total records
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-[24px] border border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-indigo-100 p-4 shadow-[0_12px_28px_rgba(99,102,241,0.08)]">
          <div className="text-sm font-medium text-slate-500">Outstanding balance</div>
          <div className="mt-3 text-3xl font-black tracking-[-0.05em] text-slate-900">{formatNaira(outstanding)}</div>
        </div>
        <div className="rounded-[24px] border border-rose-200 bg-gradient-to-br from-rose-50 via-white to-rose-100 p-4 shadow-[0_12px_28px_rgba(244,63,94,0.08)]">
          <div className="text-sm font-medium text-slate-500">Overdue ({overdue.length})</div>
          <div className="mt-3 text-3xl font-black tracking-[-0.05em] text-red-700">{formatNaira(overdueBalance)}</div>
        </div>
      </div>

      {canWriteBusinessData(businessRole) && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Create an invoice</h2>
          <InvoiceCreateForm customers={customers} />
        </div>
      )}

      {error && <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {statusMessage && <p role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{statusMessage}</p>}

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">Loading invoices...</div>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:block">
            <table className="w-full min-w-[780px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="px-3 py-3 font-semibold">Customer</th>
                  <th className="px-3 py-3 font-semibold">Due date</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 text-right font-semibold">Total</th>
                  <th className="px-3 py-3 text-right font-semibold">Balance</th>
                  <th className="px-3 py-3 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => {
                  const paid = getInvoicePaidTotal(invoice);
                  const balance = getInvoiceBalance(invoice);
                  const isQuote = invoice.document_type === 'quote';
                  const isOverdue = !isQuote && invoice.due_date && invoice.due_date < today && balance > 0;
                  const status = isQuote ? 'quote' : invoice.status === 'draft' ? 'draft' : balance <= 0 ? 'paid' : isOverdue ? 'overdue' : paid > 0 ? 'partial' : 'unpaid';
                  const canMarkPaid = canWriteBusinessData(businessRole) && !isQuote && invoice.status !== 'draft' && balance > 0;
                  return (
                    <tr key={invoice.id} className="border-b border-slate-200 last:border-none">
                      <td className="px-3 py-3 font-medium text-slate-800">{invoice.customer?.name || '—'}</td>
                      <td className="px-3 py-3 text-slate-600">{invoice.due_date || '—'}</td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                          isOverdue
                            ? 'bg-red-100 text-red-700'
                            : status === 'paid'
                              ? 'bg-emerald-100 text-emerald-700'
                              : status === 'partial'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-slate-100 text-slate-700'
                        }`}>
                          {status}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-slate-900">{formatNaira(invoice.total)}</td>
                      <td className="px-3 py-3 text-right font-medium text-slate-700">{formatNaira(balance)}</td>
                      <td className="px-3 py-3 text-right">
                        <div className="flex flex-col items-end gap-2">
                          <a href={`/dashboard/invoices/${invoice.id}`} className="font-semibold text-violet-700 transition hover:text-violet-900 hover:underline">
                            View
                          </a>
                          {canMarkPaid && (
                            <button
                              type="button"
                              onClick={() => markInvoiceAsPaid(invoice.id, balance)}
                              disabled={markingPaidId === invoice.id}
                              className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-60"
                            >
                              {markingPaidId === invoice.id ? 'Sending...' : 'Mark paid'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {invoices.length === 0 && (
                  <tr>
                    <td colSpan="6" className="px-3 py-8 text-center text-slate-400">
                      No invoices created yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 md:hidden">
            {invoices.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">No invoices created yet.</div>
            ) : invoices.map((invoice) => {
              const paid = getInvoicePaidTotal(invoice);
              const balance = getInvoiceBalance(invoice);
              const isQuote = invoice.document_type === 'quote';
              const isOverdue = !isQuote && invoice.due_date && invoice.due_date < today && balance > 0;
              const status = isQuote ? 'quote' : invoice.status === 'draft' ? 'draft' : balance <= 0 ? 'paid' : isOverdue ? 'overdue' : paid > 0 ? 'partial' : 'unpaid';
              const canMarkPaid = canWriteBusinessData(businessRole) && !isQuote && invoice.status !== 'draft' && balance > 0;
              return (
                <article key={invoice.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="break-words font-semibold text-slate-900">{invoice.customer?.name || 'Customer'}</h2>
                      <p className="mt-1 text-xs text-slate-500">{isQuote ? 'Quote' : 'Invoice'} · Due {invoice.due_date || 'not set'}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                      isOverdue
                        ? 'bg-red-100 text-red-700'
                        : status === 'paid'
                          ? 'bg-emerald-100 text-emerald-700'
                          : status === 'partial'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-slate-100 text-slate-700'
                    }`}>{status}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm">
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-slate-500">Total</div>
                      <div className="mt-1 font-semibold text-slate-900">{formatNaira(invoice.total)}</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-slate-500">Balance</div>
                      <div className="mt-1 font-semibold text-slate-900">{formatNaira(balance)}</div>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <a href={`/dashboard/invoices/${invoice.id}`} className="btn-secondary flex-1 text-center text-sm">View</a>
                    {canMarkPaid && (
                      <button
                        type="button"
                        onClick={() => markInvoiceAsPaid(invoice.id, balance)}
                        disabled={markingPaidId === invoice.id}
                        className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 disabled:opacity-60"
                      >
                        {markingPaidId === invoice.id ? 'Sending...' : 'Mark paid'}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
