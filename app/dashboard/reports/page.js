'use client';

import { useEffect, useState } from 'react';
import Papa from 'papaparse';
import { createClient } from '../../../lib/supabaseClient';
import { getInvoiceBalance } from '../../../lib/invoiceBalance';

const formatNaira = (value) => `₦${Number(value || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
const periodOptions = [
  { value: 'daily', label: 'Today' },
  { value: 'weekly', label: 'This week' },
  { value: 'monthly', label: 'This month' },
  { value: 'yearly', label: 'This year' },
  { value: 'custom', label: 'Custom' },
];

function toDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getPeriodStart(period) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (period === 'weekly') {
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  } else if (period === 'monthly') {
    start.setDate(1);
  } else if (period === 'yearly') {
    start.setMonth(0, 1);
  }
  return start;
}

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

export default function ReportsPage() {
  const supabase = createClient();
  const [period, setPeriod] = useState('weekly');
  const [selectedCustomerId, setSelectedCustomerId] = useState('all');
  const [customers, setCustomers] = useState([]);
  const [customStartDate, setCustomStartDate] = useState(toDateString(getPeriodStart('weekly')));
  const [customEndDate, setCustomEndDate] = useState(toDateString(new Date()));
  const [summary, setSummary] = useState(null);
  const [cashFlow, setCashFlow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const normalizedCustomStartDate = customStartDate <= customEndDate ? customStartDate : customEndDate;
  const normalizedCustomEndDate = customStartDate <= customEndDate ? customEndDate : customStartDate;
  const effectiveStartDate = period === 'custom' ? normalizedCustomStartDate : toDateString(getPeriodStart(period));
  const effectiveEndDate = period === 'custom' ? normalizedCustomEndDate || toDateString(new Date()) : toDateString(new Date());

  async function runReport() {
    setLoading(true);
    setErrorMessage('');
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      setSummary(null);
      setErrorMessage('Your session has expired. Please sign in again to view reports.');
      setLoading(false);
      return;
    }

    const forecastStart = new Date();
    forecastStart.setDate(forecastStart.getDate() - 30);
    const forecastStartDate = toDateString(forecastStart);
    const forecastEnd = new Date();
    forecastEnd.setDate(forecastEnd.getDate() + 30);
    const forecastEndDate = toDateString(forecastEnd);
    const todayDate = toDateString(new Date());

    let salesQuery = supabase.from('sales').select('sale_date, amount, cost_amount, customer_id, product_id, product_name, quantity, description').eq('user_id', user.id).gte('sale_date', effectiveStartDate).lte('sale_date', effectiveEndDate).order('sale_date');
    if (selectedCustomerId !== 'all') {
      salesQuery = salesQuery.eq('customer_id', selectedCustomerId);
    }

    const [salesRes, expensesRes, customersRes, forecastExpensesRes, invoicesRes] = await Promise.all([
      salesQuery,
      supabase.from('expenses').select('expense_date, category, description, amount').eq('user_id', user.id).gte('expense_date', effectiveStartDate).lte('expense_date', effectiveEndDate),
      supabase.from('customers').select('id, name').eq('user_id', user.id).order('name'),
      supabase.from('expenses').select('expense_date, amount').eq('user_id', user.id).gte('expense_date', forecastStartDate).lte('expense_date', todayDate),
      supabase.from('invoices').select('total, due_date, status, document_type, payments:invoice_payments(amount)').eq('user_id', user.id).eq('document_type', 'invoice').neq('status', 'draft'),
    ]);

    const failedQuery = salesRes.error || expensesRes.error || customersRes.error || forecastExpensesRes.error || invoicesRes.error;
    if (failedQuery) {
      setSummary(null);
      setErrorMessage(failedQuery.message);
      setLoading(false);
      return;
    }

    const sales = salesRes.data || [];
    const expenses = expensesRes.data || [];
    const customerList = customersRes.data || [];
    setCustomers(customerList);
    const customerNames = new Map(customerList.map((customer) => [customer.id, customer.name]));
    const customerTotals = new Map();
    const productTotals = new Map();

    for (const sale of sales) {
      if (sale.customer_id) {
        const customer = customerTotals.get(sale.customer_id) || { name: customerNames.get(sale.customer_id) || 'Customer', amount: 0, orders: 0 };
        customer.amount += Number(sale.amount || 0);
        customer.orders += 1;
        customerTotals.set(sale.customer_id, customer);
      }
      if (sale.product_name) {
        const product = productTotals.get(sale.product_name) || { name: sale.product_name, quantity: 0, revenue: 0 };
        product.quantity += Number(sale.quantity || 1);
        product.revenue += Number(sale.amount || 0);
        productTotals.set(sale.product_name, product);
      }
    }

    const totalSales = sales.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const totalExpenses = expenses.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const trackedSales = sales.filter((row) => row.product_id);
    const productGrossProfit = trackedSales.reduce((sum, row) => sum + Number(row.amount || 0) - Number(row.cost_amount || 0), 0);

    setSummary({
      sales,
      expenses,
      customerNames: Object.fromEntries(customerNames),
      totalSales,
      totalExpenses,
      netProfit: totalSales - totalExpenses,
      productGrossProfit,
      trackedProductCount: trackedSales.length,
      averageSale: sales.length ? totalSales / sales.length : 0,
      topCustomers: [...customerTotals.values()].sort((a, b) => b.amount - a.amount).slice(0, 5),
      topProducts: [...productTotals.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 5),
    });
    const forecastExpenseTotal = (forecastExpensesRes.data || []).reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
    const upcomingInvoices = (invoicesRes.data || []).map((invoice) => ({
      ...invoice,
      balance: getInvoiceBalance(invoice),
    })).filter((invoice) => invoice.balance > 0 && invoice.due_date && invoice.due_date >= todayDate && invoice.due_date <= forecastEndDate);
    const weeks = Array.from({ length: 4 }, (_, index) => {
      const fromDay = index * 7;
      const toDay = index === 3 ? 29 : fromDay + 6;
      const weekStart = new Date();
      weekStart.setHours(0, 0, 0, 0);
      weekStart.setDate(weekStart.getDate() + fromDay);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + (toDay - fromDay));
      const periodStart = toDateString(weekStart);
      const periodEnd = toDateString(weekEnd);
      const receivables = upcomingInvoices
        .filter((invoice) => invoice.due_date >= periodStart && invoice.due_date <= periodEnd)
        .reduce((sum, invoice) => sum + invoice.balance, 0);
      const days = toDay - fromDay + 1;
      return {
        label: `Days ${fromDay + 1}–${toDay + 1}`,
        receivables,
        estimatedExpenses: (forecastExpenseTotal / 30) * days,
        days,
      };
    });
    setCashFlow({
      weeks,
      expectedIncome: weeks.reduce((sum, week) => sum + week.receivables, 0),
      estimatedExpenses: forecastExpenseTotal,
      overdue: (invoicesRes.data || []).map((invoice) => ({
        ...invoice,
        balance: getInvoiceBalance(invoice),
      })).filter((invoice) => invoice.balance > 0 && invoice.due_date && invoice.due_date < todayDate)
        .reduce((sum, invoice) => sum + invoice.balance, 0),
    });
    setLoading(false);
  }

  useEffect(() => {
    runReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, selectedCustomerId, customStartDate, customEndDate]);

  function handlePresetPeriod(nextPeriod) {
    setPeriod(nextPeriod);
    if (nextPeriod !== 'custom') {
      const nextRange = getPeriodStart(nextPeriod);
      setCustomStartDate(toDateString(nextRange));
      setCustomEndDate(toDateString(new Date()));
    }
  }

  function exportSales() {
    if (!summary) return;
    downloadCsv(summary.sales.map((row) => ({
      Date: row.sale_date,
      Product: row.product_name || '',
      Quantity: row.quantity || 1,
      Customer: row.customer_id ? summary.customerNames[row.customer_id] || '' : '',
      Description: row.description || '',
      Amount: Number(row.amount || 0),
    })), `sales_${effectiveStartDate}_to_${effectiveEndDate}.csv`);
  }

  function exportExpenses() {
    if (!summary) return;
    downloadCsv(summary.expenses.map((row) => ({
      Date: row.expense_date,
      Category: row.category || '',
      Description: row.description || '',
      Amount: Number(row.amount || 0),
    })), `expenses_${effectiveStartDate}_to_${effectiveEndDate}.csv`);
  }

  const customerMax = Math.max(...(summary?.topCustomers.map((item) => item.amount) || [0]), 1);
  const productMax = Math.max(...(summary?.topProducts.map((item) => item.quantity) || [0]), 1);

  return (
    <div>
      <div className="mb-5 flex flex-col gap-4 sm:mb-6 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Business insights</h1>
          <p className="mt-1 text-sm text-slate-500">{effectiveStartDate} <span aria-hidden="true">to</span> {effectiveEndDate}</p>
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0" aria-label="Report period">
          {periodOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={period === option.value}
              onClick={() => handlePresetPeriod(option.value)}
              className={`${period === option.value ? 'btn-primary' : 'btn-secondary'} shrink-0 whitespace-nowrap px-3 py-2 text-sm`}
            >
              {option.label}
            </button>
          ))}
          <button type="button" onClick={runReport} disabled={loading} className="btn-secondary shrink-0 whitespace-nowrap px-3 py-2 text-sm disabled:cursor-wait disabled:opacity-60">{loading ? 'Updating...' : 'Refresh'}</button>
        </div>
      </div>

      <section aria-label="Report filters" className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Filter report</h2>
            <p className="mt-0.5 text-xs text-slate-500">Choose a customer and reporting period.</p>
          </div>
          <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
            {period === 'custom' ? 'Custom range' : periodOptions.find((option) => option.value === period)?.label}
          </span>
        </div>
        <div className={`grid gap-3 ${period === 'custom' ? 'sm:grid-cols-2' : ''}`}>
          <label className="flex min-w-0 flex-col gap-1.5 text-xs font-semibold text-slate-600">
            Customer
            <select
              value={selectedCustomerId}
              onChange={(event) => setSelectedCustomerId(event.target.value)}
              className="input min-h-11 bg-slate-50 py-2.5 text-sm"
            >
              <option value="all">All customers</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>{customer.name}</option>
              ))}
            </select>
          </label>

          {period === 'custom' && (
            <>
              <label className="flex min-w-0 flex-col gap-1.5 text-xs font-semibold text-slate-600">
                Start date
                <input
                  type="date"
                  value={customStartDate}
                  max={customEndDate}
                  onChange={(event) => setCustomStartDate(event.target.value)}
                  className="input min-h-11 bg-slate-50 py-2.5 text-sm"
                />
              </label>
              <label className="flex min-w-0 flex-col gap-1.5 text-xs font-semibold text-slate-600">
                End date
                <input
                  type="date"
                  value={customEndDate}
                  min={customStartDate}
                  onChange={(event) => setCustomEndDate(event.target.value)}
                  className="input min-h-11 bg-slate-50 py-2.5 text-sm"
                />
              </label>
            </>
          )}
        </div>
      </section>

      {errorMessage && <div role="alert" className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div>}
      {loading ? <div className="text-slate-500">Analyzing your business...</div> : summary && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="card"><div className="text-sm text-slate-500">Sales revenue</div><div className="mt-2 text-2xl font-black text-brand-700">{formatNaira(summary.totalSales)}</div></div>
            <div className="card"><div className="text-sm text-slate-500">Expenses</div><div className="mt-2 text-2xl font-black text-red-600">{formatNaira(summary.totalExpenses)}</div></div>
            <div className="card"><div className="text-sm text-slate-500">Net operating profit</div><div className={`mt-2 text-2xl font-black ${summary.netProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{formatNaira(summary.netProfit)}</div></div>
            <div className="card"><div className="text-sm text-slate-500">Average sale</div><div className="mt-2 text-2xl font-black text-slate-900">{formatNaira(summary.averageSale)}</div></div>
          </div>

          {cashFlow && (
            <section className="mt-6 rounded-2xl border border-brand-100 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Cash-flow forecast · next 30 days</h2>
                  <p className="mt-1 text-xs text-slate-500">Expected invoice collections vs. estimated expenses based on the last 30 days.</p>
                </div>
                <div className="rounded-xl bg-brand-50 px-3 py-2 text-right">
                  <div className="text-xs text-slate-600">Forecast net</div>
                  <div className={`font-bold ${cashFlow.expectedIncome - cashFlow.estimatedExpenses >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                    {formatNaira(cashFlow.expectedIncome - cashFlow.estimatedExpenses)}
                  </div>
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {cashFlow.weeks.map((week) => (
                  <div key={week.label} className="rounded-xl bg-slate-50 p-3">
                    <h3 className="text-sm font-semibold text-slate-800">{week.label}</h3>
                    <p className="mt-2 flex justify-between gap-2 text-xs"><span className="text-slate-500">Invoice dues</span><span className="font-semibold">{formatNaira(week.receivables)}</span></p>
                    <p className="mt-1 flex justify-between gap-2 text-xs"><span className="text-slate-500">Est. expenses</span><span className="font-semibold text-red-600">{formatNaira(week.estimatedExpenses)}</span></p>
                  </div>
                ))}
              </div>
              {cashFlow.overdue > 0 && <p className="mt-3 text-xs font-medium text-amber-800">Overdue invoices excluded from expected collections: {formatNaira(cashFlow.overdue)}.</p>}
            </section>
          )}

          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <section className="card">
              <div className="mb-4 flex items-baseline justify-between gap-2">
                <h2 className="text-lg font-bold text-slate-900">Top customers</h2>
                <span className="text-xs text-slate-500">by sales value</span>
              </div>
              {summary.topCustomers.length ? <ol className="space-y-4">
                {summary.topCustomers.map((customer, index) => (
                  <li key={`${customer.name}-${index}`}>
                    <div className="mb-1 flex justify-between gap-4 text-sm"><span className="truncate font-medium">{index + 1}. {customer.name}</span><span className="shrink-0 font-semibold">{formatNaira(customer.amount)} · {customer.orders} orders</span></div>
                    <div className="h-2 overflow-hidden rounded bg-slate-100"><div className="h-full rounded bg-brand-600" style={{ width: `${Math.max(3, (customer.amount / customerMax) * 100)}%` }} /></div>
                  </li>
                ))}
              </ol> : <p className="py-6 text-center text-sm text-slate-400">No customer-linked sales for this period.</p>}
            </section>

            <section className="card">
              <div className="mb-4 flex items-baseline justify-between gap-2">
                <h2 className="text-lg font-bold text-slate-900">Top products</h2>
                <span className="text-xs text-slate-500">by units sold</span>
              </div>
              {summary.topProducts.length ? <ol className="space-y-4">
                {summary.topProducts.map((product, index) => (
                  <li key={`${product.name}-${index}`}>
                    <div className="mb-1 flex justify-between gap-4 text-sm"><span className="truncate font-medium">{index + 1}. {product.name}</span><span className="shrink-0 font-semibold">{product.quantity} sold · {formatNaira(product.revenue)}</span></div>
                    <div className="h-2 overflow-hidden rounded bg-slate-100"><div className="h-full rounded bg-emerald-600" style={{ width: `${Math.max(3, (product.quantity / productMax) * 100)}%` }} /></div>
                  </li>
                ))}
              </ol> : <p className="py-6 text-center text-sm text-slate-400">No product-linked sales for this period.</p>}
            </section>
          </div>

          <div className="mt-6 card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Product margin snapshot</h2>
                <p className="mt-1 text-sm text-slate-500">Based on recorded cost prices for tracked sales.</p>
              </div>
              <div className="text-right">
                <div className="text-xl font-black text-emerald-700">{formatNaira(summary.productGrossProfit)}</div>
                <div className="text-xs text-slate-500">{summary.trackedProductCount} tracked sale{summary.trackedProductCount === 1 ? '' : 's'}</div>
              </div>
            </div>
          </div>

          <section className="mt-6 card">
            <h2 className="mb-4 text-lg font-bold text-slate-900">Export data</h2>
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={exportSales} className="btn-primary">Export sales CSV</button>
              <button type="button" onClick={exportExpenses} className="btn-secondary">Export expenses CSV</button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}