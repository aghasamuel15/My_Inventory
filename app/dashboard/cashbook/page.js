'use client';

import { useEffect, useState } from 'react';
import { createClient } from '../../../lib/supabaseClient';

const formatNaira = (value) => `₦${Number(value || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;

function toDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getMonthStart() {
  const date = new Date();
  date.setDate(1);
  return toDateString(date);
}

export default function CashbookPage() {
  const supabase = createClient();
  const [account, setAccount] = useState('cash');
  const [startDate, setStartDate] = useState(getMonthStart);
  const [endDate, setEndDate] = useState(toDateString(new Date()));
  const [openingBalance, setOpeningBalance] = useState('0');
  const [actualClosingBalance, setActualClosingBalance] = useState('');
  const [notes, setNotes] = useState('');
  const [totals, setTotals] = useState(null);
  const [history, setHistory] = useState([]);
  const [unassignedTransactions, setUnassignedTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [assigningId, setAssigningId] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [statusMessage, setStatusMessage] = useState('');

  async function load() {
    setLoading(true);
    setErrorMessage('');
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      setTotals(null);
      setHistory([]);
      setUnassignedTransactions([]);
      setErrorMessage(authError?.message || 'Your session has expired. Please sign in again.');
      setLoading(false);
      return;
    }

    const [totalsResult, historyResult, salesResult, expensesResult, invoicePaymentsResult] = await Promise.all([
      supabase.rpc('get_cashbook_period_totals', { p_start_date: startDate, p_end_date: endDate }),
      supabase.from('cashbook_reconciliations').select('*').eq('user_id', user.id).eq('account', account).order('reconciled_at', { ascending: false }).limit(10),
      supabase.from('sales').select('id, sale_date, product_name, description, amount').eq('user_id', user.id).eq('payment_account', 'unassigned').gte('sale_date', startDate).lte('sale_date', endDate).order('sale_date', { ascending: false }).limit(100),
      supabase.from('expenses').select('id, expense_date, category, description, amount').eq('user_id', user.id).eq('payment_account', 'unassigned').gte('expense_date', startDate).lte('expense_date', endDate).order('expense_date', { ascending: false }).limit(100),
      supabase.from('invoice_payments').select('id, payment_date, amount, reference, notes').eq('user_id', user.id).eq('cashbook_account', 'unassigned').gte('payment_date', startDate).lte('payment_date', endDate).order('payment_date', { ascending: false }).limit(100),
    ]);

    const failed = totalsResult.error || historyResult.error || salesResult.error || expensesResult.error || invoicePaymentsResult.error;
    if (failed) {
      setTotals(null);
      setErrorMessage(failed.message || 'Could not load cashbook data.');
      setLoading(false);
      return;
    }

    const accountTotals = (totalsResult.data || []).find((row) => row.account === account);
    setTotals(accountTotals || { sales_total: 0, expenses_total: 0, unassigned_count: 0 });
    setHistory(historyResult.data || []);
    const unassigned = [
      ...(salesResult.data || []).map((row) => ({
        ...row,
        type: 'sale',
        date: row.sale_date,
        title: row.product_name || row.description || 'Sale',
        accountLabel: 'Paid into',
      })),
      ...(expensesResult.data || []).map((row) => ({
        ...row,
        type: 'expense',
        date: row.expense_date,
        title: row.category || row.description || 'Expense',
        accountLabel: 'Paid from',
      })),
      ...(invoicePaymentsResult.data || []).map((row) => ({
        ...row,
        type: 'invoice_payment',
        date: row.payment_date,
        title: row.reference || row.notes || 'Invoice payment',
        accountLabel: 'Deposit to',
      })),
    ].sort((a, b) => b.date.localeCompare(a.date));
    setUnassignedTransactions(unassigned);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, startDate, endDate]);

  const salesTotal = Number(totals?.sales_total || 0);
  const expensesTotal = Number(totals?.expenses_total || 0);
  const expectedClosingBalance = Number(openingBalance || 0) + salesTotal - expensesTotal;
  const variance = Number(actualClosingBalance || 0) - expectedClosingBalance;
  const hasValidDates = Boolean(startDate && endDate && startDate <= endDate);

  async function handleReconcile(event) {
    event.preventDefault();
    setErrorMessage('');
    setStatusMessage('');
    if (!hasValidDates) {
      setErrorMessage('The start date must be on or before the end date.');
      return;
    }
    if (actualClosingBalance === '' || !Number.isFinite(Number(openingBalance)) || !Number.isFinite(Number(actualClosingBalance))) {
      setErrorMessage('Enter valid opening and actual closing balances.');
      return;
    }
    if (Number(totals?.unassigned_count || 0) > 0) {
      setErrorMessage('Assign the historical transactions below to cash or bank before reconciling this period.');
      return;
    }

    setSaving(true);
    const { error } = await supabase.rpc('reconcile_cashbook', {
      p_account: account,
      p_start_date: startDate,
      p_end_date: endDate,
      p_opening_balance: Number(openingBalance),
      p_actual_closing_balance: Number(actualClosingBalance),
      p_notes: notes.trim() || null,
    });
    if (error) {
      setErrorMessage(error.message || 'Could not save the reconciliation.');
      setSaving(false);
      return;
    }

    setStatusMessage(`${account === 'cash' ? 'Cash' : 'Bank'} reconciliation saved.`);
    setActualClosingBalance('');
    setNotes('');
    setSaving(false);
    await load();
  }

  async function assignAccount(transaction, nextAccount) {
    if (!nextAccount) return;
    const transactionKey = `${transaction.type}-${transaction.id}`;
    setAssigningId(transactionKey);
    setErrorMessage('');
    setStatusMessage('');
    let data;
    let error;
    if (transaction.type === 'invoice_payment') {
      const result = await supabase.rpc('assign_invoice_payment_cashbook_account', {
        p_payment_id: transaction.id,
        p_account: nextAccount,
      });
      data = result.error ? null : { id: transaction.id };
      error = result.error;
    } else {
      const table = transaction.type === 'sale' ? 'sales' : 'expenses';
      const result = await supabase
        .from(table)
        .update({ payment_account: nextAccount })
        .eq('id', transaction.id)
        .eq('payment_account', 'unassigned')
        .select('id')
        .maybeSingle();
      data = result.data;
      error = result.error;
    }

    if (error || !data) {
      setErrorMessage(error?.message || 'That transaction was already updated. Refresh and try again.');
      setAssigningId('');
      return;
    }

    setStatusMessage('Transaction assigned to the selected account.');
    setAssigningId('');
    await load();
  }

  return (
    <div>
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Cash management</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">Cashbook reconciliation</h1>
        <p className="mt-1 text-sm text-slate-600">Compare sales, invoice receipts, and expenses with your counted cash or bank statement balance.</p>
      </div>

      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-600">
            Account
            <select className="input min-h-11 bg-slate-50 py-2.5 text-sm" value={account} onChange={(event) => setAccount(event.target.value)}>
              <option value="cash">Cash</option>
              <option value="bank">Bank</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-600">
            From
            <input className="input min-h-11 bg-slate-50 py-2.5 text-sm" type="date" value={startDate} max={endDate} onChange={(event) => setStartDate(event.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-600">
            To
            <input className="input min-h-11 bg-slate-50 py-2.5 text-sm" type="date" value={endDate} min={startDate} onChange={(event) => setEndDate(event.target.value)} />
          </label>
        </div>
      </section>

      {errorMessage && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</p>}
      {statusMessage && <p role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{statusMessage}</p>}

      {loading ? <p className="text-sm text-slate-500">Loading cashbook...</p> : totals && (
        <>
          {Number(totals.unassigned_count) > 0 && (
            <section className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:p-5">
              <h2 className="font-bold text-amber-950">Categorize older transactions</h2>
              <p className="mt-1 text-sm text-amber-900">
                {totals.unassigned_count} transaction{Number(totals.unassigned_count) === 1 ? '' : 's'} in this range have no account recorded. They are excluded from balances until assigned.
              </p>
              {unassignedTransactions.length ? (
                <ul className="mt-4 space-y-2">
                  {unassignedTransactions.map((transaction) => {
                    const transactionKey = `${transaction.type}-${transaction.id}`;
                    return (
                      <li key={transactionKey} className="flex flex-col gap-2 rounded-xl border border-amber-100 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">{transaction.title}</p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {transaction.date} · {transaction.type === 'sale' ? 'Sale' : transaction.type === 'expense' ? 'Expense' : 'Invoice receipt'} · {formatNaira(transaction.amount)}
                          </p>
                        </div>
                        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                          {transaction.accountLabel}
                          <select
                            className="min-h-10 rounded-lg border border-slate-200 bg-white px-2 text-sm"
                            value=""
                            disabled={assigningId === transactionKey}
                            onChange={(event) => assignAccount(transaction, event.target.value)}
                          >
                            <option value="" disabled>Select</option>
                            <option value="cash">Cash</option>
                            <option value="bank">Bank</option>
                          </select>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              ) : <p className="mt-3 text-sm font-medium text-amber-900">No unassigned transactions were returned. Refresh or choose another date range.</p>}
              {unassignedTransactions.length > 0 && unassignedTransactions.length < Number(totals.unassigned_count) && (
                <p className="mt-3 text-xs text-amber-900">Showing {unassignedTransactions.length} of {totals.unassigned_count} unassigned transactions. Categorize these, then continue with the remaining items.</p>
              )}
            </section>
          )}

          <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="card"><p className="text-sm text-slate-500">Opening balance</p><p className="mt-2 text-xl font-bold text-slate-900">{formatNaira(openingBalance)}</p></div>
            <div className="card"><p className="text-sm text-slate-500">Sales & invoice receipts</p><p className="mt-2 text-xl font-bold text-emerald-700">{formatNaira(salesTotal)}</p></div>
            <div className="card"><p className="text-sm text-slate-500">Expenses in period</p><p className="mt-2 text-xl font-bold text-red-600">{formatNaira(expensesTotal)}</p></div>
            <div className="card"><p className="text-sm text-slate-500">Expected closing balance</p><p className="mt-2 text-xl font-bold text-slate-900">{formatNaira(expectedClosingBalance)}</p></div>
          </div>

          <form onSubmit={handleReconcile} className="card mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div>
              <label className="label" htmlFor="cashbook-opening">Opening balance</label>
              <input id="cashbook-opening" className="input" type="number" step="0.01" required value={openingBalance} onChange={(event) => setOpeningBalance(event.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="cashbook-actual">Actual closing balance</label>
              <input id="cashbook-actual" className="input" type="number" step="0.01" required value={actualClosingBalance} onChange={(event) => setActualClosingBalance(event.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="cashbook-notes">Notes (optional)</label>
              <input id="cashbook-notes" className="input" value={notes} onChange={(event) => setNotes(event.target.value)} />
            </div>
            <div className="flex flex-col justify-end">
              <p className={`mb-2 text-sm font-semibold ${variance === 0 ? 'text-emerald-700' : variance > 0 ? 'text-amber-700' : 'text-red-700'}`}>
                Difference: {actualClosingBalance === '' ? '—' : formatNaira(variance)}
              </p>
              <button type="submit" disabled={saving || loading || !hasValidDates || Number(totals.unassigned_count) > 0} className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-60">
                {saving ? 'Saving...' : 'Save reconciliation'}
              </button>
            </div>
          </form>

          <section className="card">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-bold text-slate-900">Recent {account} reconciliations</h2>
              <span className="text-xs text-slate-500">Saved reconciliation snapshots</span>
            </div>
            {history.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">No reconciliations saved for this account yet.</p>
            ) : (
              <ul className="space-y-3">
                {history.map((item) => (
                  <li key={item.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3 sm:p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">{item.start_date} to {item.end_date}</p>
                        <p className="mt-1 text-xs text-slate-500">Saved {new Date(item.reconciled_at).toLocaleString()}</p>
                        {item.notes && <p className="mt-2 text-sm text-slate-600">{item.notes}</p>}
                      </div>
                      <span className={`font-bold ${Number(item.variance) === 0 ? 'text-emerald-700' : Number(item.variance) > 0 ? 'text-amber-700' : 'text-red-700'}`}>
                        Difference {formatNaira(item.variance)}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-200 pt-3 text-xs sm:grid-cols-4">
                      <p><span className="block text-slate-500">Opening</span><span className="font-semibold">{formatNaira(item.opening_balance)}</span></p>
                      <p><span className="block text-slate-500">Expected</span><span className="font-semibold">{formatNaira(item.calculated_closing_balance)}</span></p>
                      <p><span className="block text-slate-500">Actual</span><span className="font-semibold">{formatNaira(item.actual_closing_balance)}</span></p>
                      <p><span className="block text-slate-500">Income / expenses</span><span className="font-semibold">{formatNaira(item.sales_total)} / {formatNaira(item.expenses_total)}</span></p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
