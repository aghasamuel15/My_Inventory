'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Papa from 'papaparse';
import { createClient } from '../../../lib/supabaseClient';

const formatNaira = (value) => `₦${Number(value || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;

function downloadCsv(rows, filename) {
  const csv = Papa.unparse(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

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
  const supabase = useMemo(() => createClient(), []);
  const [account, setAccount] = useState('cash');
  const [startDate, setStartDate] = useState(getMonthStart);
  const [endDate, setEndDate] = useState(toDateString(new Date()));
  const [initialOpeningBalance, setInitialOpeningBalance] = useState('');
  const [actualClosingBalance, setActualClosingBalance] = useState('');
  const [notes, setNotes] = useState('');
  const [totals, setTotals] = useState(null);
  const [accountTotals, setAccountTotals] = useState({ cash: null, bank: null });
  const [history, setHistory] = useState([]);
  const [unassignedTransactions, setUnassignedTransactions] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [adjustmentForm, setAdjustmentForm] = useState({ direction: 'income', amount: '', transaction_date: '', description: '' });
  const [editingAdjustments, setEditingAdjustments] = useState({});
  const [loading, setLoading] = useState(true);
  const [autoSaving, setAutoSaving] = useState(false);
  const [exportingId, setExportingId] = useState('');
  const [assigningId, setAssigningId] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const autoSaveTimer = useRef(null);
  const autoSaveVersion = useRef(0);

  async function load({ resetReconciliation = true } = {}) {
    setLoading(true);
    setErrorMessage('');
    setStatusMessage('');
    if (resetReconciliation) {
      setActualClosingBalance('');
      setInitialOpeningBalance('');
      setNotes('');
    }
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      setTotals(null);
      setHistory([]);
      setUnassignedTransactions([]);
      setErrorMessage(authError?.message || 'Your session has expired. Please sign in again.');
      setLoading(false);
      return;
    }

    const [cashTotalsResult, bankTotalsResult, historyResult, salesResult, expensesResult, invoicePaymentsResult, adjustmentsResult, currentResult] = await Promise.all([
      supabase.rpc('get_cashbook_period_totals', { p_start_date: startDate, p_end_date: endDate, p_account: 'cash' }),
      supabase.rpc('get_cashbook_period_totals', { p_start_date: startDate, p_end_date: endDate, p_account: 'bank' }),
      supabase.from('cashbook_reconciliations').select('*').eq('user_id', user.id).eq('account', account).order('reconciled_at', { ascending: false }).limit(10),
      supabase.from('sales').select('id, sale_date, product_name, description, amount, payment_account').eq('user_id', user.id).in('payment_account', [account, 'unassigned']).gte('sale_date', startDate).lte('sale_date', endDate).order('sale_date', { ascending: false }).limit(500),
      supabase.from('expenses').select('id, expense_date, category, description, amount, payment_account').eq('user_id', user.id).in('payment_account', [account, 'unassigned']).gte('expense_date', startDate).lte('expense_date', endDate).order('expense_date', { ascending: false }).limit(500),
      supabase.from('invoice_payments').select('id, payment_date, amount, reference, notes, method, cashbook_account, invoice:invoices(invoice_number)').eq('user_id', user.id).in('cashbook_account', [account, 'unassigned']).gte('payment_date', startDate).lte('payment_date', endDate).order('payment_date', { ascending: false }).limit(500),
      supabase.from('cashbook_adjustments').select('*').eq('user_id', user.id).eq('account', account).gte('transaction_date', startDate).lte('transaction_date', endDate).order('transaction_date', { ascending: false }).limit(500),
      supabase.from('cashbook_reconciliations').select('*').eq('user_id', user.id).eq('account', account).eq('start_date', startDate).eq('end_date', endDate).order('reconciled_at', { ascending: false }).limit(1).maybeSingle(),
    ]);

    const failed = cashTotalsResult.error || bankTotalsResult.error || historyResult.error || salesResult.error || expensesResult.error || invoicePaymentsResult.error || adjustmentsResult.error || currentResult.error;
    if (failed) {
      setTotals(null);
      setErrorMessage(failed.message || 'Could not load cashbook data.');
      setLoading(false);
      return;
    }

    const cashTotals = cashTotalsResult.data?.[0];
    const bankTotals = bankTotalsResult.data?.[0];
    setAccountTotals({ cash: cashTotals || null, bank: bankTotals || null });
    const activeAccountTotals = account === 'cash' ? cashTotals : bankTotals;
    setTotals(activeAccountTotals || { sales_total: 0, expenses_total: 0, adjustment_income: 0, adjustment_expenses: 0, opening_balance: null, opening_is_initial: true, unassigned_count: 0 });
    const uniqueHistory = new Map();
    for (const item of historyResult.data || []) {
      const key = `${item.start_date}:${item.end_date}`;
      if (!uniqueHistory.has(key)) uniqueHistory.set(key, item);
    }
    setHistory([...uniqueHistory.values()]);
    if (resetReconciliation) {
      if (currentResult.data) {
        setActualClosingBalance(String(currentResult.data.actual_closing_balance));
        setNotes(currentResult.data.notes || '');
        if (activeAccountTotals?.opening_balance == null) {
          setInitialOpeningBalance(String(currentResult.data.opening_balance));
        }
      }
      if (activeAccountTotals?.opening_balance != null) {
        setInitialOpeningBalance(String(activeAccountTotals.opening_balance));
      }
    }
    const unassigned = [
      ...(salesResult.data || []).map((row) => ({
        ...row,
        type: 'sale',
        date: row.sale_date,
        title: row.product_name || row.description || 'Sale',
        accountLabel: 'Paid into',
        direction: 'income',
      })),
      ...(expensesResult.data || []).map((row) => ({
        ...row,
        type: 'expense',
        date: row.expense_date,
        title: row.category || row.description || 'Expense',
        accountLabel: 'Paid from',
        direction: 'expense',
      })),
      ...(invoicePaymentsResult.data || []).map((row) => ({
        ...row,
        type: 'invoice_payment',
        date: row.payment_date,
        title: row.invoice?.invoice_number ? `Invoice ${row.invoice.invoice_number}` : row.reference || row.notes || 'Invoice payment',
        accountLabel: 'Deposit to',
        direction: 'income',
      })),
    ].sort((a, b) => b.date.localeCompare(a.date));
    setUnassignedTransactions(unassigned);
    const items = [
      ...(salesResult.data || []).filter((row) => row.payment_account === account).map((row) => ({
        id: row.id,
        source: 'sale',
        date: row.sale_date,
        description: row.product_name || row.description || 'Sale',
        direction: 'income',
        amount: Number(row.amount || 0),
        account: row.payment_account,
      })),
      ...(expensesResult.data || []).filter((row) => row.payment_account === account).map((row) => ({
        id: row.id,
        source: 'expense',
        date: row.expense_date,
        description: row.category || row.description || 'Expense',
        direction: 'expense',
        amount: Number(row.amount || 0),
        account: row.payment_account,
      })),
      ...(invoicePaymentsResult.data || []).filter((row) => row.cashbook_account === account).map((row) => ({
        id: row.id,
        source: 'invoice_payment',
        date: row.payment_date,
        description: row.invoice?.invoice_number ? `Invoice ${row.invoice.invoice_number}` : row.reference || row.notes || 'Invoice payment',
        direction: 'income',
        amount: Number(row.amount || 0),
        account: row.cashbook_account,
      })),
      ...(adjustmentsResult.data || []).map((row) => ({
        id: row.id,
        source: 'adjustment',
        date: row.transaction_date,
        description: row.description,
        direction: row.direction,
        amount: Number(row.amount || 0),
        account: row.account,
      })),
    ].sort((a, b) => b.date.localeCompare(a.date));
    setTransactions(items);
    setAdjustmentForm((current) => ({ ...current, transaction_date: endDate }));
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, startDate, endDate]);

  const openingBalance = totals?.opening_balance == null
    ? Number(initialOpeningBalance || 0)
    : Number(totals.opening_balance);
  const hasOpeningBalance = totals?.opening_balance != null || initialOpeningBalance.trim() !== '';
  const salesTotal = Number(totals?.sales_total || 0);
  const expensesTotal = Number(totals?.expenses_total || 0);
  const adjustmentIncome = Number(totals?.adjustment_income || 0);
  const adjustmentExpenses = Number(totals?.adjustment_expenses || 0);
  const expectedClosingBalance = openingBalance + salesTotal - expensesTotal + adjustmentIncome - adjustmentExpenses;
  const variance = Number(actualClosingBalance || 0) - expectedClosingBalance;
  const hasValidDates = Boolean(startDate && endDate && startDate <= endDate);

  useEffect(() => {
    autoSaveVersion.current += 1;
    const version = autoSaveVersion.current;
    window.clearTimeout(autoSaveTimer.current);
    if (
      loading ||
      !totals ||
      !hasValidDates ||
      !hasOpeningBalance ||
      actualClosingBalance === '' ||
      !Number.isFinite(openingBalance) ||
      !Number.isFinite(Number(actualClosingBalance)) ||
      Number(totals.unassigned_count || 0) > 0
    ) {
      setAutoSaving(false);
      return undefined;
    }

    setStatusMessage('');
    setErrorMessage('');
    autoSaveTimer.current = window.setTimeout(async () => {
      if (version !== autoSaveVersion.current) return;
      setAutoSaving(true);
      const { data: reconciliationId, error } = await supabase.rpc('reconcile_cashbook', {
        p_account: account,
        p_start_date: startDate,
        p_end_date: endDate,
        p_actual_closing_balance: Number(actualClosingBalance),
        p_notes: notes.trim() || null,
        p_initial_opening_balance: totals.opening_balance == null ? openingBalance : null,
      });

      if (error) {
        if (version === autoSaveVersion.current) {
          setErrorMessage(error.message || 'Could not automatically save the reconciliation.');
          setAutoSaving(false);
        }
        return;
      }

      const { data: savedReconciliation, error: savedError } = await supabase
        .from('cashbook_reconciliations')
        .select('*')
        .eq('id', reconciliationId)
        .single();
      if (savedError) {
        if (version === autoSaveVersion.current) {
          setErrorMessage(savedError.message || 'Reconciliation saved, but its review details could not be loaded.');
          setAutoSaving(false);
        }
        return;
      }

      if (version === autoSaveVersion.current) {
        setHistory((current) => [
          savedReconciliation,
          ...current.filter((item) => item.id !== savedReconciliation.id
            && !(item.start_date === startDate && item.end_date === endDate)),
        ].slice(0, 10));
        setTotals((current) => (
          current?.opening_balance == null
            ? { ...current, opening_balance: savedReconciliation.opening_balance }
            : current
        ));
        setStatusMessage(`Saved automatically at ${new Date().toLocaleTimeString()}.`);
        setAutoSaving(false);
      }
    }, 700);

    return () => window.clearTimeout(autoSaveTimer.current);
  }, [
    account,
    actualClosingBalance,
    endDate,
    hasOpeningBalance,
    hasValidDates,
    initialOpeningBalance,
    loading,
    notes,
    openingBalance,
    startDate,
    supabase,
    totals,
  ]);

  async function addAdjustment(event) {
    event.preventDefault();
    setErrorMessage('');
    setStatusMessage('');
    const amount = Number(adjustmentForm.amount);
    if (!Number.isFinite(amount) || amount <= 0 || !adjustmentForm.description.trim()) {
      setErrorMessage('Enter a positive amount and describe the missing item.');
      return;
    }
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      setErrorMessage(authError?.message || 'Your session has expired. Please sign in again.');
      return;
    }

    const { error } = await supabase.from('cashbook_adjustments').insert({
      user_id: user.id,
      account,
      direction: adjustmentForm.direction,
      amount,
      transaction_date: adjustmentForm.transaction_date,
      description: adjustmentForm.description.trim(),
    });
    if (error) {
      setErrorMessage(error.message || 'Could not add the cashbook adjustment.');
      return;
    }
    setAdjustmentForm({ direction: variance < 0 ? 'expense' : 'income', amount: '', transaction_date: endDate, description: '' });
    await load({ resetReconciliation: false });
  }

  function startEditingAdjustment(item) {
    setEditingAdjustments((current) => ({
      ...current,
      [item.id]: {
        direction: item.direction,
        amount: String(item.amount),
        transaction_date: item.transaction_date,
        description: item.description,
      },
    }));
  }

  async function saveAdjustment(item) {
    const draft = editingAdjustments[item.id];
    const amount = Number(draft?.amount);
    if (!draft || !Number.isFinite(amount) || amount <= 0 || !draft.description.trim()) {
      setErrorMessage('Enter a positive adjustment amount and description.');
      return;
    }
    const { error } = await supabase
      .from('cashbook_adjustments')
      .update({
        direction: draft.direction,
        amount,
        transaction_date: draft.transaction_date,
        description: draft.description.trim(),
      })
      .eq('id', item.id)
      .eq('account', account);
    if (error) {
      setErrorMessage(error.message || 'Could not update the cashbook adjustment.');
      return;
    }
    setEditingAdjustments((current) => {
      const next = { ...current };
      delete next[item.id];
      return next;
    });
    await load({ resetReconciliation: false });
  }

  async function deleteAdjustment(item) {
    if (!window.confirm(`Delete the adjustment “${item.description}”?`)) return;
    const { error } = await supabase
      .from('cashbook_adjustments')
      .delete()
      .eq('id', item.id)
      .eq('account', account);
    if (error) {
      setErrorMessage(error.message || 'Could not delete the cashbook adjustment.');
      return;
    }
    setEditingAdjustments((current) => {
      const next = { ...current };
      delete next[item.id];
      return next;
    });
    await load({ resetReconciliation: false });
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
    await load({ resetReconciliation: false });
  }

  async function exportReconciliation(reconciliation) {
    setExportingId(reconciliation.id);
    setErrorMessage('');
    setStatusMessage('');

    const [salesResult, expensesResult, invoicePaymentsResult, adjustmentsResult] = await Promise.all([
      supabase
        .from('sales')
        .select('sale_date, product_name, description, amount')
        .eq('payment_account', reconciliation.account)
        .gte('sale_date', reconciliation.start_date)
        .lte('sale_date', reconciliation.end_date),
      supabase
        .from('expenses')
        .select('expense_date, category, description, amount')
        .eq('payment_account', reconciliation.account)
        .gte('expense_date', reconciliation.start_date)
        .lte('expense_date', reconciliation.end_date),
      supabase
        .from('invoice_payments')
        .select('payment_date, amount, reference, notes, invoice:invoices(invoice_number)')
        .eq('cashbook_account', reconciliation.account)
        .gte('payment_date', reconciliation.start_date)
        .lte('payment_date', reconciliation.end_date),
      supabase
        .from('cashbook_adjustments')
        .select('transaction_date, direction, amount, description')
        .eq('account', reconciliation.account)
        .gte('transaction_date', reconciliation.start_date)
        .lte('transaction_date', reconciliation.end_date),
    ]);

    const failed = salesResult.error || expensesResult.error || invoicePaymentsResult.error || adjustmentsResult.error;
    if (failed) {
      setErrorMessage(failed.message || 'Could not load reconciliation details for the CSV.');
      setExportingId('');
      return;
    }

    const sales = salesResult.data || [];
    const expenses = expensesResult.data || [];
    const invoicePayments = invoicePaymentsResult.data || [];
    const adjustments = adjustmentsResult.data || [];
    const adjustmentIncome = adjustments
      .filter((item) => item.direction === 'income')
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const adjustmentExpenses = adjustments
      .filter((item) => item.direction === 'expense')
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const columns = [
      'Record type',
      'Account',
      'Start date',
      'End date',
      'Saved at',
      'Opening balance',
      'Recorded income',
      'Recorded expenses',
      'Adjustment income',
      'Adjustment expenses',
      'Expected closing balance',
      'Actual closing balance',
      'Difference',
      'Notes',
      'Transaction date',
      'Transaction type',
      'Description',
      'Direction',
      'Amount',
    ];
    const summaryRow = [
      'Reconciliation summary',
      reconciliation.account,
      reconciliation.start_date,
      reconciliation.end_date,
      reconciliation.reconciled_at,
      reconciliation.opening_balance,
      reconciliation.sales_total,
      reconciliation.expenses_total,
      adjustmentIncome,
      adjustmentExpenses,
      reconciliation.calculated_closing_balance,
      reconciliation.actual_closing_balance,
      reconciliation.variance,
      reconciliation.notes || '',
      '',
      '',
      '',
      '',
      '',
    ];
    const detailRows = [
      ...sales.map((item) => [
        'Transaction', reconciliation.account, '', '', '', '', '', '', '', '', '', '', '', '',
        item.sale_date, 'Sale', item.product_name || item.description || 'Sale', 'Income', item.amount,
      ]),
      ...expenses.map((item) => [
        'Transaction', reconciliation.account, '', '', '', '', '', '', '', '', '', '', '', '',
        item.expense_date, 'Expense', item.category || item.description || 'Expense', 'Expense', item.amount,
      ]),
      ...invoicePayments.map((item) => [
        'Transaction', reconciliation.account, '', '', '', '', '', '', '', '', '', '', '', '',
        item.payment_date,
        'Invoice payment',
        item.invoice?.invoice_number ? `Invoice ${item.invoice.invoice_number}` : item.reference || item.notes || 'Invoice payment',
        'Income',
        item.amount,
      ]),
      ...adjustments.map((item) => [
        'Transaction', reconciliation.account, '', '', '', '', '', '', '', '', '', '', '', '',
        item.transaction_date, 'Adjustment', item.description, item.direction === 'income' ? 'Income' : 'Expense', item.amount,
      ]),
    ].sort((a, b) => String(a[14]).localeCompare(String(b[14])));

    downloadCsv(
      [columns, summaryRow, ...detailRows],
      `cashbook-reconciliation-${reconciliation.account}-${reconciliation.start_date}-to-${reconciliation.end_date}.csv`,
    );
    setStatusMessage('Reconciliation CSV downloaded.');
    setExportingId('');
  }

  return (
    <div>
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Cash management</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">Cashbook reconciliation</h1>
        <p className="mt-1 text-sm text-slate-600">Review cash and bank activity, compare it with the closing balance, and track any missing items.</p>
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
          <section aria-label="Cash and bank overview" className="mb-6 grid gap-3 sm:grid-cols-2">
            {['cash', 'bank'].map((accountName) => {
              const summary = accountTotals[accountName];
              const isSelected = account === accountName;
              const expected = Number(summary?.opening_balance || 0)
                + Number(summary?.sales_total || 0)
                - Number(summary?.expenses_total || 0)
                + Number(summary?.adjustment_income || 0)
                - Number(summary?.adjustment_expenses || 0);
              return (
                <button
                  type="button"
                  key={accountName}
                  onClick={() => setAccount(accountName)}
                  aria-pressed={isSelected}
                  className={`rounded-2xl border p-4 text-left shadow-sm transition ${isSelected ? 'border-brand-300 bg-brand-50 ring-2 ring-brand-100' : 'border-slate-200 bg-white hover:border-brand-200'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="font-bold capitalize text-slate-900">{accountName}</h2>
                    <span className="text-xs font-semibold text-slate-500">{isSelected ? 'Reviewing' : 'View details'}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                    <p><span className="block text-slate-500">Opening</span><span className="mt-0.5 block font-semibold text-slate-900">{summary?.opening_balance == null ? 'Set initial balance' : formatNaira(summary.opening_balance)}</span></p>
                    <p><span className="block text-slate-500">Expected close</span><span className="mt-0.5 block font-semibold text-slate-900">{summary?.opening_balance == null ? '—' : formatNaira(expected)}</span></p>
                    <p><span className="block text-slate-500">Received</span><span className="mt-0.5 block font-semibold text-emerald-700">{formatNaira(Number(summary?.sales_total || 0) + Number(summary?.adjustment_income || 0))}</span></p>
                    <p><span className="block text-slate-500">Paid</span><span className="mt-0.5 block font-semibold text-red-700">{formatNaira(Number(summary?.expenses_total || 0) + Number(summary?.adjustment_expenses || 0))}</span></p>
                  </div>
                </button>
              );
            })}
          </section>

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
                <p className="mt-3 text-xs text-amber-900">Showing {unassignedTransactions.length} of {totals.unassigned_count} unassigned transactions. Narrow the date range to categorize the rest.</p>
              )}
            </section>
          )}

          <section className="card mb-6">
            <div className="mb-4">
              <h2 className="text-lg font-bold text-slate-900">{account === 'cash' ? 'Cash' : 'Bank'} reconciliation</h2>
              <p className="mt-1 text-sm text-slate-500">The opening balance carries forward from the previous reconciliation. Your counted or statement closing balance is needed to identify a difference.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {totals.opening_balance == null ? (
                <div>
                  <label className="label" htmlFor="cashbook-opening">Initial opening balance (enter once)</label>
                  <input id="cashbook-opening" className="input" type="number" step="0.01" value={initialOpeningBalance} onChange={(event) => setInitialOpeningBalance(event.target.value)} />
                </div>
              ) : (
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Opening balance · carried forward</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">{formatNaira(openingBalance)}</p>
                </div>
              )}
              <div className="rounded-xl bg-emerald-50 p-3">
                <p className="text-xs text-emerald-800">Received in period</p>
                <p className="mt-1 text-lg font-bold text-emerald-800">{formatNaira(salesTotal + adjustmentIncome)}</p>
                <p className="mt-1 text-xs text-emerald-800">Sales/invoice receipts {formatNaira(salesTotal)} · adjustments {formatNaira(adjustmentIncome)}</p>
              </div>
              <div className="rounded-xl bg-red-50 p-3">
                <p className="text-xs text-red-800">Paid in period</p>
                <p className="mt-1 text-lg font-bold text-red-800">{formatNaira(expensesTotal + adjustmentExpenses)}</p>
                <p className="mt-1 text-xs text-red-800">Expenses {formatNaira(expensesTotal)} · adjustments {formatNaira(adjustmentExpenses)}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Expected closing balance</p>
                <p className="mt-1 text-lg font-bold text-slate-900">{hasOpeningBalance ? formatNaira(expectedClosingBalance) : 'Enter initial opening'}</p>
              </div>
              <div>
                <label className="label" htmlFor="cashbook-actual">Actual closing balance</label>
                <input id="cashbook-actual" className="input" type="number" step="0.01" value={actualClosingBalance} onChange={(event) => setActualClosingBalance(event.target.value)} placeholder="Counted cash / statement" />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="cashbook-notes">Review notes (optional)</label>
                <input id="cashbook-notes" className="input" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Notes about this reconciliation" />
              </div>
              <div className="flex flex-col justify-center rounded-xl bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Difference</p>
                <p className={`mt-1 text-lg font-bold ${variance === 0 ? 'text-emerald-700' : variance > 0 ? 'text-amber-700' : 'text-red-700'}`}>
                  {!hasOpeningBalance ? 'Set initial opening' : actualClosingBalance === '' ? 'Enter actual close' : formatNaira(variance)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {!hasOpeningBalance ? 'The first reconciliation needs a starting balance.' : actualClosingBalance === '' ? 'Will calculate from your statement/count.' : Math.abs(variance) < 0.005 ? 'Balances match.' : variance > 0 ? 'Actual is higher; review for missing income.' : 'Actual is lower; review for missing payments.'}
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
              <p role="status" className="text-sm text-slate-600">
                {autoSaving
                  ? 'Saving reconciliation...'
                  : statusMessage || (Number(totals.unassigned_count) > 0
                    ? 'Assign all older transactions to enable automatic reconciliation.'
                    : !hasOpeningBalance
                      ? 'Enter the initial opening balance and actual closing balance to save automatically.'
                      : actualClosingBalance === ''
                        ? 'Enter the actual closing balance; reconciliation saves automatically.'
                        : 'Changes save automatically.')}
              </p>
              {!Number(totals.unassigned_count) && hasOpeningBalance && actualClosingBalance !== '' && Math.abs(variance) >= 0.005 && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setAdjustmentForm({
                    direction: variance > 0 ? 'income' : 'expense',
                    amount: String(Math.abs(variance).toFixed(2)),
                    transaction_date: endDate,
                    description: '',
                  })}
                >
                  Review and add the difference
                </button>
              )}
            </div>
          </section>

          <section className="card mb-6">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Add a missing item</h2>
                <p className="mt-1 text-sm text-slate-500">Add an unrecorded receipt or payment as a separate, editable cashbook adjustment. Original sales and expenses stay unchanged.</p>
              </div>
              {actualClosingBalance !== '' && Math.abs(variance) >= 0.005 && (
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${variance > 0 ? 'bg-amber-50 text-amber-800' : 'bg-red-50 text-red-800'}`}>
                  Difference to review: {formatNaira(Math.abs(variance))}
                </span>
              )}
            </div>
            <form onSubmit={addAdjustment} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <label className="label" htmlFor="adjustment-direction">Item type</label>
                <select id="adjustment-direction" className="input" value={adjustmentForm.direction} onChange={(event) => setAdjustmentForm({ ...adjustmentForm, direction: event.target.value })}>
                  <option value="income">Missing receipt / income</option>
                  <option value="expense">Missing payment / expense</option>
                </select>
              </div>
              <div>
                <label className="label" htmlFor="adjustment-amount">Amount</label>
                <input id="adjustment-amount" className="input" type="number" min="0.01" step="0.01" required value={adjustmentForm.amount} onChange={(event) => setAdjustmentForm({ ...adjustmentForm, amount: event.target.value })} />
              </div>
              <div>
                <label className="label" htmlFor="adjustment-date">Date</label>
                <input id="adjustment-date" className="input" type="date" min={startDate} max={endDate} required value={adjustmentForm.transaction_date} onChange={(event) => setAdjustmentForm({ ...adjustmentForm, transaction_date: event.target.value })} />
              </div>
              <div>
                <label className="label" htmlFor="adjustment-description">Description</label>
                <input id="adjustment-description" className="input" required value={adjustmentForm.description} onChange={(event) => setAdjustmentForm({ ...adjustmentForm, description: event.target.value })} placeholder="What was missing?" />
              </div>
              <div className="sm:col-span-2 xl:col-span-4">
                <button type="submit" className="btn-primary">Add item to {account}</button>
              </div>
            </form>
          </section>

          <section className="card mb-8">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold text-slate-900">{account === 'cash' ? 'Cash' : 'Bank'} activity details</h2>
                <p className="mt-1 text-sm text-slate-500">Review every item received and paid in this date range. Select the other account above to review it too.</p>
              </div>
              <span className="text-xs text-slate-500">{transactions.length} item{transactions.length === 1 ? '' : 's'}</span>
            </div>
            {transactions.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">No transactions for this account in this date range.</p>
            ) : (
              <ul className="space-y-2">
                {transactions.map((item) => {
                  const draft = editingAdjustments[item.id];
                  return (
                    <li key={`${item.source}-${item.id}`} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                      {draft ? (
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                          <select aria-label="Adjustment type" className="input" value={draft.direction} onChange={(event) => setEditingAdjustments({ ...editingAdjustments, [item.id]: { ...draft, direction: event.target.value } })}>
                            <option value="income">Income</option>
                            <option value="expense">Expense</option>
                          </select>
                          <input aria-label="Adjustment amount" className="input" type="number" min="0.01" step="0.01" value={draft.amount} onChange={(event) => setEditingAdjustments({ ...editingAdjustments, [item.id]: { ...draft, amount: event.target.value } })} />
                          <input aria-label="Adjustment date" className="input" type="date" min={startDate} max={endDate} value={draft.transaction_date} onChange={(event) => setEditingAdjustments({ ...editingAdjustments, [item.id]: { ...draft, transaction_date: event.target.value } })} />
                          <input aria-label="Adjustment description" className="input" value={draft.description} onChange={(event) => setEditingAdjustments({ ...editingAdjustments, [item.id]: { ...draft, description: event.target.value } })} />
                          <div className="flex gap-2">
                            <button type="button" onClick={() => saveAdjustment(item)} className="btn-primary flex-1">Save</button>
                            <button type="button" onClick={() => deleteAdjustment(item)} className="btn-secondary">Delete</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${item.direction === 'income' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>
                                {item.direction === 'income' ? 'Received' : 'Paid'}
                              </span>
                              {item.source === 'adjustment' && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Adjustment</span>}
                            </div>
                            <p className="mt-1 truncate text-sm font-semibold text-slate-900">{item.description}</p>
                            <p className="mt-0.5 text-xs capitalize text-slate-500">{item.date} · {item.source.replace('_', ' ')} · {item.account}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className={`font-bold ${item.direction === 'income' ? 'text-emerald-700' : 'text-red-700'}`}>
                              {item.direction === 'income' ? '+' : '−'}{formatNaira(item.amount)}
                            </span>
                            {item.source === 'adjustment' && <button type="button" onClick={() => startEditingAdjustment(item)} className="btn-secondary px-3 py-2 text-sm">Edit</button>}
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

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
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="min-h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-brand-700 hover:bg-brand-50"
                        onClick={() => {
                          setStartDate(item.start_date);
                          setEndDate(item.end_date);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                      >
                        Review this reconciliation
                      </button>
                      <button
                        type="button"
                        className="btn-secondary min-h-10"
                        disabled={exportingId === item.id}
                        onClick={() => exportReconciliation(item)}
                      >
                        {exportingId === item.id ? 'Preparing CSV...' : 'Download CSV'}
                      </button>
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
