'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '../../../lib/supabaseClient';
import { estimateRunway, estimateStockRunout } from '../../../lib/cashRunway.mjs';
import { getInvoiceBalance } from '../../../lib/invoiceBalance';
import { getBusinessContext } from '../../../lib/businessContext';

const formatNaira = (value) => `₦${Number(value || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
const formatDate = (value) => value.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
const dateKey = (value) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;

function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('0')) return `234${digits.slice(1)}`;
  if (digits.length === 10) return `234${digits}`;
  return digits;
}

function recurringTemplateAmount(items) {
  return (Array.isArray(items) ? items : []).reduce((sum, item) => (
    sum + Number(item.amount ?? (Number(item.quantity || 0) * Number(item.unit_price ?? item.unitPrice ?? 0)))
  ), 0);
}

function fallsAfterAnchor(transactionDate, anchor) {
  return anchor.inclusive ? transactionDate >= anchor.date : transactionDate > anchor.date;
}

export default function CashRunwayPage() {
  const supabase = useMemo(() => createClient(), []);
  const [report, setReport] = useState(null);
  const [purchaseAmount, setPurchaseAmount] = useState(300000);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError('');
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        setError(authError?.message || 'Please sign in to view your cash runway.');
        setLoading(false);
        return;
      }
      const { business_id: businessId } = await getBusinessContext(supabase, user.id);

      const today = new Date();
      const todayKey = dateKey(today);
      const historyStart = new Date(today);
      historyStart.setDate(historyStart.getDate() - 60);
      const historyStartKey = dateKey(historyStart);
      const [reconciliationsResult, openingsResult, invoicesResult, productsResult, recurringResult] = await Promise.all([
        supabase.from('cashbook_reconciliations').select('account, end_date, actual_closing_balance, reconciled_at').eq('user_id', businessId).lte('end_date', todayKey).order('end_date', { ascending: false }).order('reconciled_at', { ascending: false }),
        supabase.from('cashbook_account_openings').select('account, initial_balance, created_at').eq('user_id', businessId),
        supabase.from('invoices').select('id, customer_id, invoice_number, total, due_date, status, document_type, customer:customers(name, phone), payments:invoice_payments(amount)').eq('user_id', businessId),
        supabase.from('inventory_products').select('id, name, quantity, low_stock_threshold, cost_price').eq('user_id', businessId).eq('is_active', true),
        supabase.from('recurring_invoice_templates').select('id, frequency, next_issue_date, items, tax').eq('user_id', businessId).eq('active', true),
      ]);
      const initialError = [reconciliationsResult, openingsResult, invoicesResult, productsResult, recurringResult].find((result) => result.error)?.error;
      if (initialError) {
        setError(initialError.message || 'Could not load runway data.');
        setLoading(false);
        return;
      }

      const reconciliations = new Map();
      for (const row of reconciliationsResult.data || []) {
        if (!reconciliations.has(row.account)) reconciliations.set(row.account, row);
      }
      const openings = new Map((openingsResult.data || []).map((row) => [row.account, row]));
      const anchors = new Map();
      for (const account of ['cash', 'bank']) {
        const reconciliation = reconciliations.get(account);
        const opening = openings.get(account);
        if (reconciliation) {
          anchors.set(account, { balance: Number(reconciliation.actual_closing_balance || 0), date: reconciliation.end_date, inclusive: false });
        } else if (opening) {
          anchors.set(account, { balance: Number(opening.initial_balance || 0), date: opening.created_at.slice(0, 10), inclusive: true });
        }
      }

      const queryStart = [...anchors.values()].reduce(
        (earliest, anchor) => anchor.date < earliest ? anchor.date : earliest,
        historyStartKey
      );
      const [salesResult, expensesResult, paymentsResult, adjustmentsResult] = await Promise.all([
        supabase.from('sales').select('sale_date, amount, product_id, quantity, payment_account').eq('user_id', businessId).gte('sale_date', queryStart).lte('sale_date', todayKey),
        supabase.from('expenses').select('expense_date, amount, payment_account').eq('user_id', businessId).gte('expense_date', queryStart).lte('expense_date', todayKey),
        supabase.from('invoice_payments').select('payment_date, amount, cashbook_account').eq('user_id', businessId).gte('payment_date', queryStart).lte('payment_date', todayKey),
        supabase.from('cashbook_adjustments').select('transaction_date, amount, direction, account').eq('user_id', businessId).gte('transaction_date', queryStart).lte('transaction_date', todayKey),
      ]);
      const activityError = [salesResult, expensesResult, paymentsResult, adjustmentsResult].find((result) => result.error)?.error;
      if (activityError) {
        setError(activityError.message || 'Could not load recent cash movements.');
        setLoading(false);
        return;
      }

      const sales = salesResult.data || [];
      const expenses = expensesResult.data || [];
      const payments = paymentsResult.data || [];
      const adjustments = adjustmentsResult.data || [];
      let cashBalance = 0;
      for (const [account, anchor] of anchors) {
        cashBalance += anchor.balance;
        cashBalance += sales.filter((row) => row.payment_account === account && fallsAfterAnchor(row.sale_date, anchor)).reduce((sum, row) => sum + Number(row.amount || 0), 0);
        cashBalance += payments.filter((row) => row.cashbook_account === account && fallsAfterAnchor(row.payment_date, anchor)).reduce((sum, row) => sum + Number(row.amount || 0), 0);
        cashBalance -= expenses.filter((row) => row.payment_account === account && fallsAfterAnchor(row.expense_date, anchor)).reduce((sum, row) => sum + Number(row.amount || 0), 0);
        cashBalance += adjustments.filter((row) => row.account === account && fallsAfterAnchor(row.transaction_date, anchor)).reduce((sum, row) => (
          sum + (row.direction === 'income' ? 1 : -1) * Number(row.amount || 0)
        ), 0);
      }

      const recentSales = sales.filter((row) => row.sale_date >= historyStartKey && row.payment_account !== 'unassigned')
        .reduce((sum, row) => sum + Number(row.amount || 0), 0);
      const recentInvoicePayments = payments.filter((row) => row.payment_date >= historyStartKey && row.cashbook_account !== 'unassigned')
        .reduce((sum, row) => sum + Number(row.amount || 0), 0);
      const recentExpenses = expenses.filter((row) => row.expense_date >= historyStartKey && row.payment_account !== 'unassigned')
        .reduce((sum, row) => sum + Number(row.amount || 0), 0);
      const recentAdjustments = adjustments.filter((row) => row.transaction_date >= historyStartKey)
        .reduce((sum, row) => sum + (row.direction === 'income' ? -1 : 1) * Number(row.amount || 0), 0);
      const dailyNetOutflow = Math.max(0, (recentExpenses + recentAdjustments - recentSales - recentInvoicePayments) / 60);

      const invoices = invoicesResult.data || [];
      const overdueByCustomer = new Map();
      for (const invoice of invoices) {
        const balance = invoice.document_type === 'quote' || invoice.status === 'draft' ? 0 : getInvoiceBalance(invoice);
        if (balance <= 0 || !invoice.due_date || invoice.due_date >= todayKey) continue;
        const customerKey = invoice.customer_id || invoice.id;
        const current = overdueByCustomer.get(customerKey) || {
          customerId: customerKey,
          name: invoice.customer?.name || 'Customer',
          phone: invoice.customer?.phone || '',
          balance: 0,
          invoiceNumbers: [],
        };
        current.balance += balance;
        if (invoice.invoice_number) current.invoiceNumbers.push(invoice.invoice_number);
        overdueByCustomer.set(customerKey, current);
      }
      const overdueCustomers = [...overdueByCustomer.values()].sort((left, right) => right.balance - left.balance);
      const overdueBalance = overdueCustomers.reduce((sum, customer) => sum + customer.balance, 0);
      const stockRunouts = estimateStockRunout(productsResult.data || [], sales.filter((row) => row.sale_date >= historyStartKey && row.product_id));
      const upcomingTemplates = (recurringResult.data || []).filter((template) => template.next_issue_date >= todayKey);
      const upcomingInvoiceValue = upcomingTemplates.reduce((sum, template) => sum + recurringTemplateAmount(template.items) + Number(template.tax || 0), 0);

      setReport({
        today,
        cashBalance: anchors.size ? cashBalance : null,
        trackedAccounts: anchors.size,
        dailyNetOutflow,
        recentSales: recentSales + recentInvoicePayments,
        recentExpenses,
        overdueBalance,
        overdueCustomers,
        stockRunouts,
        upcomingTemplateCount: upcomingTemplates.length,
        upcomingInvoiceValue,
      });
      setLoading(false);
    }

    load();
  }, [supabase]);

  const forecast = report?.cashBalance == null ? null : estimateRunway({
    balance: report.cashBalance,
    dailyNetOutflow: report.dailyNetOutflow,
    overdueBalance: report.overdueBalance,
    purchaseAmount,
    today: report.today,
  });
  const urgentStock = report?.stockRunouts.filter((product) => product.daysUntilStockout <= 14).slice(0, 5) || [];

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Planning</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Cash runway</h1>
        </div>
        <Link href="/dashboard/cashbook" className="btn-secondary text-sm">Update cashbook</Link>
      </header>

      {loading ? <p className="text-sm text-slate-500">Building your cash forecast...</p> : error ? (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
      ) : report.cashBalance == null ? (
        <section className="border-y border-slate-200 bg-white px-5 py-8">
          <h2 className="text-lg font-bold text-slate-900">Add a cashbook opening balance</h2>
          <p className="mt-2 max-w-xl text-sm text-slate-600">A reliable runway needs a starting cash or bank balance. Set one in Cashbook, then this forecast can include the transactions recorded since.</p>
          <Link href="/dashboard/cashbook" className="btn-primary mt-4 inline-flex">Open cashbook</Link>
        </section>
      ) : (
        <>
          <section className="border-y border-slate-200 bg-white px-5 py-6 sm:px-7">
            <div className="grid gap-7 lg:grid-cols-[1fr_auto] lg:items-end">
              <div>
                <p className="text-sm font-semibold text-slate-500">At your recent net cash pace</p>
                {forecast.depletionDate ? (
                  <h2 className="mt-2 text-3xl font-black leading-tight text-slate-900 sm:text-4xl">Cash may run short by <span className="text-rose-700">{formatDate(forecast.depletionDate)}</span></h2>
                ) : <h2 className="mt-2 text-3xl font-black leading-tight text-slate-900 sm:text-4xl">No cash shortfall is projected</h2>}
                <p className="mt-3 max-w-2xl text-sm text-slate-600">You have {formatNaira(report.cashBalance)} across {report.trackedAccounts === 2 ? 'cash and bank' : 'one tracked account'}. Recent recorded net outflow is {formatNaira(report.dailyNetOutflow)} per day.</p>
              </div>
              <div className="min-w-44 border-l-2 border-emerald-600 pl-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Overdue invoices</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">{formatNaira(report.overdueBalance)}</p>
                <p className="text-sm text-slate-500">from {report.overdueCustomers.length} customer{report.overdueCustomers.length === 1 ? '' : 's'}</p>
              </div>
            </div>
            {report.overdueBalance > 0 && <p className="mt-5 border-t border-slate-100 pt-4 text-sm text-emerald-800">Collecting all overdue invoices would extend the estimate to {forecast.afterOverdueCollectionDate ? formatDate(forecast.afterOverdueCollectionDate) : 'beyond the current trend'}.</p>}
          </section>

          <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
            <section aria-labelledby="what-if-heading" className="border-b border-slate-200 pb-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="what-if-heading" className="text-lg font-bold text-slate-900">What if you buy stock now?</h2>
                <span className="text-sm font-semibold text-slate-700">{formatNaira(purchaseAmount)}</span>
              </div>
              <input aria-label="Stock purchase amount" className="mt-4 w-full accent-emerald-700" type="range" min="0" max="1000000" step="25000" value={purchaseAmount} onChange={(event) => setPurchaseAmount(Number(event.target.value))} />
              <div className="flex justify-between text-xs text-slate-500"><span>₦0</span><span>₦1,000,000</span></div>
              <p className="mt-3 text-sm text-slate-600">{purchaseAmount > 0 && forecast.afterPurchaseDate ? `After this purchase, cash may run short by ${formatDate(forecast.afterPurchaseDate)}.` : purchaseAmount > 0 ? 'This purchase does not create a shortfall at the recent net cash pace.' : 'Move the slider to test a planned stock purchase.'}</p>
            </section>

            <section className="border-b border-slate-200 pb-6">
              <h2 className="text-lg font-bold text-slate-900">Recent pace · 60 days</h2>
              <dl className="mt-3 grid grid-cols-2 gap-4 text-sm">
                <div><dt className="text-slate-500">Cash in</dt><dd className="mt-1 font-semibold text-slate-900">{formatNaira(report.recentSales)}</dd></div>
                <div><dt className="text-slate-500">Cash out</dt><dd className="mt-1 font-semibold text-slate-900">{formatNaira(report.recentExpenses)}</dd></div>
              </dl>
            </section>
          </div>

          <div className="mt-8 grid gap-8 lg:grid-cols-2">
            <section>
              <div className="flex items-baseline justify-between gap-3 border-b border-slate-200 pb-3"><h2 className="text-lg font-bold text-slate-900">Overdue customers</h2><Link href="/dashboard/invoices" className="text-sm font-semibold text-brand-700 hover:underline">All invoices</Link></div>
              {report.overdueCustomers.length ? (
                <ul className="divide-y divide-slate-100">
                  {report.overdueCustomers.slice(0, 5).map((customer) => {
                    const phone = normalizePhone(customer.phone);
                    const invoiceText = customer.invoiceNumbers.length ? ` (invoice ${customer.invoiceNumbers.join(', ')})` : '';
                    const message = `Hello ${customer.name}, a friendly reminder that ${formatNaira(customer.balance)} is overdue${invoiceText}. Please let us know when we can expect payment. Thank you.`;
                    const reminderUrl = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}` : null;
                    return <li key={customer.customerId} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-semibold text-slate-900">{customer.name}</p><p className="text-sm text-slate-500">{formatNaira(customer.balance)} overdue</p></div>{reminderUrl ? <a href={reminderUrl} target="_blank" rel="noreferrer" className="btn-secondary text-sm">Remind on WhatsApp</a> : <span className="text-xs text-slate-500">No phone number saved</span>}</li>;
                  })}
                </ul>
              ) : <p className="py-4 text-sm text-slate-500">No overdue invoices recorded.</p>}
            </section>

            <section>
              <div className="flex items-baseline justify-between gap-3 border-b border-slate-200 pb-3"><h2 className="text-lg font-bold text-slate-900">Stock running low</h2><Link href="/dashboard/inventory" className="text-sm font-semibold text-brand-700 hover:underline">Review stock</Link></div>
              {urgentStock.length ? (
                <ul className="divide-y divide-slate-100">
                  {urgentStock.map((product) => <li key={product.id} className="flex items-center justify-between gap-3 py-3"><div><p className="font-semibold text-slate-900">{product.name}</p><p className="text-sm text-slate-500">About {product.daysUntilStockout} days of stock left</p></div><span className="text-right text-sm text-slate-600">Reorder est.<br /><strong className="text-slate-900">{formatNaira(product.estimatedReorderCost)}</strong></span></li>)}
                </ul>
              ) : <p className="py-4 text-sm text-slate-500">No likely stock-outs in the next 14 days based on recorded sales.</p>}
            </section>
          </div>

          <section className="mt-8 border-y border-slate-200 py-5">
            <div className="flex flex-wrap items-baseline justify-between gap-3"><h2 className="text-lg font-bold text-slate-900">Scheduled invoices</h2><Link href="/dashboard/invoices/recurring" className="text-sm font-semibold text-brand-700 hover:underline">Manage schedules</Link></div>
            <p className="mt-2 text-sm text-slate-600">{report.upcomingTemplateCount ? `${report.upcomingTemplateCount} active schedule${report.upcomingTemplateCount === 1 ? '' : 's'} with a next issue on or after today, estimated at ${formatNaira(report.upcomingInvoiceValue)}. Draft invoices need review and collection is not guaranteed, so this is not counted in runway.` : 'No upcoming recurring invoices are scheduled.'}</p>
          </section>

          <p className="mt-5 text-xs leading-5 text-slate-500">Estimate uses recorded cash and bank balances and the last 60 days of assigned sales, invoice payments, expenses, and cashbook adjustments. Unassigned transactions and future recurring expenses are not included. Sales pace, collections, and supplier costs can change actual results.</p>
        </>
      )}
    </div>
  );
}