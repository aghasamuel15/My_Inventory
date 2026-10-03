'use client';

import { useEffect, useState } from 'react';
import { createClient } from '../../lib/supabaseClient';
import StatCard from '../../components/StatCard';
import { getInvoiceBalance } from '../../lib/invoiceBalance';

const formatNaira = (value) => `₦${Number(value || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;

export default function DashboardPage() {
  const supabase = createClient();
  const [businessName, setBusinessName] = useState('My Business');
  const [stats, setStats] = useState({
    todaySales: 0,
    todayExpenses: 0,
    weeklySales: 0,
    weeklyExpenses: 0,
    weeklyProfit: 0,
    outstandingBalance: 0,
    overdueBalance: 0,
    overdueCount: 0,
    dueNext30Days: 0,
    projectedExpenses30Days: 0,
    lowStockCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('business_name')
        .eq('id', user.id)
        .maybeSingle();

      setBusinessName(profile?.business_name?.trim() || 'My Business');

      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
      const weekStart = new Date(today.getTime() - (today.getDay() || 7) * 24 * 60 * 60 * 1000);
      weekStart.setHours(0, 0, 0, 0);
      const thirtyDaysAgo = new Date(today);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      thirtyDaysAgo.setHours(0, 0, 0, 0);
      const thirtyDaysAhead = new Date(today);
      thirtyDaysAhead.setDate(thirtyDaysAhead.getDate() + 30);
      const todayDate = today.toISOString().slice(0, 10);
      const forecastEndDate = thirtyDaysAhead.toISOString().slice(0, 10);

      const results = await Promise.all([
        supabase.from('sales').select('amount').eq('user_id', user.id).gte('sale_date', startOfDay),
        supabase.from('expenses').select('amount').eq('user_id', user.id).gte('expense_date', startOfDay),
        supabase.from('sales').select('amount').eq('user_id', user.id).gte('sale_date', weekStart.toISOString()),
        supabase.from('expenses').select('amount').eq('user_id', user.id).gte('expense_date', weekStart.toISOString()),
        supabase.from('invoices').select('total, due_date, status, document_type, payments:invoice_payments(amount)').eq('user_id', user.id),
        supabase.from('expenses').select('amount').eq('user_id', user.id).gte('expense_date', thirtyDaysAgo.toISOString().slice(0, 10)).lte('expense_date', todayDate),
        supabase.from('inventory_products').select('quantity, low_stock_threshold').eq('user_id', user.id).eq('is_active', true),
      ]);
      const queryError = results.find((result) => result.error)?.error;
      if (queryError) {
        setError(queryError.message || 'Could not load dashboard totals.');
        setLoading(false);
        return;
      }
      const [salesToday, expensesToday, salesWeek, expensesWeek, invoices, expenses30Days, inventory] = results;

      const todaySalesValue = (salesToday.data || []).reduce((sum, item) => sum + Number(item.amount || 0), 0);
      const todayExpensesValue = (expensesToday.data || []).reduce((sum, item) => sum + Number(item.amount || 0), 0);
      const weeklySalesValue = (salesWeek.data || []).reduce((sum, item) => sum + Number(item.amount || 0), 0);
      const weeklyExpensesValue = (expensesWeek.data || []).reduce((sum, item) => sum + Number(item.amount || 0), 0);
      const expenses30DaysValue = (expenses30Days.data || []).reduce((sum, item) => sum + Number(item.amount || 0), 0);
      const debtInvoices = invoices.data || [];
      const balances = debtInvoices.map((invoice) => ({
        balance: invoice.document_type === 'quote' || invoice.status === 'draft' ? 0 : getInvoiceBalance(invoice),
        dueDate: invoice.due_date,
      }));
      const debtValue = balances.reduce((sum, invoice) => sum + invoice.balance, 0);
      const overdueInvoices = balances.filter((invoice) => (
        invoice.balance > 0 && invoice.dueDate && invoice.dueDate < todayDate
      ));
      const overdueValue = overdueInvoices.reduce((sum, invoice) => sum + invoice.balance, 0);
      const dueNext30Days = balances.filter((invoice) => (
        invoice.balance > 0 && invoice.dueDate && invoice.dueDate >= todayDate && invoice.dueDate <= forecastEndDate
      )).reduce((sum, invoice) => sum + invoice.balance, 0);
      const lowStockCount = (inventory.data || []).filter((product) => (
        Number(product.quantity) <= Number(product.low_stock_threshold)
      )).length;

      setStats({
        todaySales: todaySalesValue,
        todayExpenses: todayExpensesValue,
        weeklySales: weeklySalesValue,
        weeklyExpenses: weeklyExpensesValue,
        weeklyProfit: weeklySalesValue - weeklyExpensesValue,
        outstandingBalance: debtValue,
        overdueBalance: overdueValue,
        overdueCount: overdueInvoices.length,
        dueNext30Days,
        projectedExpenses30Days: expenses30DaysValue,
        lowStockCount,
      });
      setLoading(false);
    }

    load();
  }, [supabase]);

  return (
    <div>
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Overview</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">Welcome back, {businessName}!</h1>
      </div>

      {loading ? (
        <div className="text-slate-500">Loading overview...</div>
      ) : error ? (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
      ) : (
        <>
          <section className="mb-5 rounded-2xl bg-gradient-to-br from-brand-700 to-emerald-600 p-5 text-white shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-white/80">Business health · this week</p>
                <h2 className="mt-1 text-2xl font-black">{formatNaira(stats.weeklyProfit)}</h2>
                <p className="mt-1 text-xs text-white/80">Net operating profit</p>
              </div>
              <div className="rounded-xl bg-white/15 px-3 py-2 text-right">
                <p className="text-xs text-white/80">30-day cash outlook</p>
                <p className="font-bold">{formatNaira(stats.dueNext30Days - stats.projectedExpenses30Days)}</p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/20 pt-4 sm:grid-cols-4">
              <div><p className="text-xs text-white/75">Sales</p><p className="mt-1 text-sm font-semibold">{formatNaira(stats.weeklySales)}</p></div>
              <div><p className="text-xs text-white/75">Expenses</p><p className="mt-1 text-sm font-semibold">{formatNaira(stats.weeklyExpenses)}</p></div>
              <div><p className="text-xs text-white/75">Invoice dues · 30d</p><p className="mt-1 text-sm font-semibold">{formatNaira(stats.dueNext30Days)}</p></div>
              <div><p className="text-xs text-white/75">Low-stock products</p><p className="mt-1 text-sm font-semibold">{stats.lowStockCount}</p></div>
            </div>
          </section>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <StatCard label="Sales today" value={formatNaira(stats.todaySales)} tone="brand" />
            <StatCard label="Expenses today" value={formatNaira(stats.todayExpenses)} tone="red" />
            <StatCard label="Outstanding invoices" value={formatNaira(stats.outstandingBalance)} tone="amber" />
            <StatCard label={`Overdue invoices (${stats.overdueCount})`} value={formatNaira(stats.overdueBalance)} tone="red" />
            <StatCard label="Projected expenses · 30 days" value={formatNaira(stats.projectedExpenses30Days)} tone="amber" />
          </div>
        </>
      )}
    </div>
  );
}
