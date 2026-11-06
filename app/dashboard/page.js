'use client';

import { useEffect, useState } from 'react';
import { createClient } from '../../lib/supabaseClient';
import { getBusinessContext } from '../../lib/businessContext';
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

      const { business_id: businessId } = await getBusinessContext(supabase, user.id);
      const { data: profile } = await supabase
        .from('businesses')
        .select('name')
        .eq('id', businessId)
        .maybeSingle();

      setBusinessName(profile?.name?.trim() || 'My Business');

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
        supabase.from('sales').select('amount').eq('user_id', businessId).gte('sale_date', startOfDay),
        supabase.from('expenses').select('amount').eq('user_id', businessId).gte('expense_date', startOfDay),
        supabase.from('sales').select('amount').eq('user_id', businessId).gte('sale_date', weekStart.toISOString()),
        supabase.from('expenses').select('amount').eq('user_id', businessId).gte('expense_date', weekStart.toISOString()),
        supabase.from('invoices').select('total, due_date, status, document_type, payments:invoice_payments(amount)').eq('user_id', businessId),
        supabase.from('expenses').select('amount').eq('user_id', businessId).gte('expense_date', thirtyDaysAgo.toISOString().slice(0, 10)).lte('expense_date', todayDate),
        supabase.from('inventory_products').select('quantity, low_stock_threshold').eq('user_id', businessId).eq('is_active', true),
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
      <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#927b56]">Your business at a glance</p>
          <h1 className="mt-2 text-[1.7rem] font-semibold tracking-[-0.045em] text-[#20372c] sm:text-[2rem]">Welcome back, {businessName}</h1>
          <p className="mt-1 text-sm text-[#738078]">A clear view of today’s activity and what’s ahead.</p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-[#e1e7df] bg-white px-3 py-2 text-[11px] font-medium text-[#68756f] shadow-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-[#4c9870]" />
          Overview
        </span>
      </div>

      {loading ? (
        <div role="status" className="space-y-5" aria-label="Loading overview">
          <div className="h-48 animate-pulse rounded-[24px] bg-[#e6ebe4]" />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2, 3, 4].map((item) => <div key={item} className="h-32 animate-pulse rounded-[20px] bg-[#e9ede7]" />)}
          </div>
        </div>
      ) : error ? (
        <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>
      ) : (
        <>
          <section className="relative mb-6 overflow-hidden rounded-[26px] border border-[#234a3c] bg-gradient-to-br from-[#163c30] via-[#12392e] to-[#0d2b22] p-5 text-white shadow-[0_18px_42px_rgba(18,57,46,0.2)] sm:p-7">
            <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full border border-white/[0.08]" />
            <div className="pointer-events-none absolute -right-4 -top-12 h-48 w-48 rounded-full border border-white/[0.08]" />
            <div className="pointer-events-none absolute bottom-0 right-24 h-28 w-28 rounded-full bg-[#b99256]/[0.08] blur-2xl" />
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="relative">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#d5c293]">Business health · this week</p>
                <h2 className="mt-3 text-3xl font-semibold tracking-[-0.055em] sm:text-4xl">{formatNaira(stats.weeklyProfit)}</h2>
                <p className="mt-1.5 text-xs text-white/65">Net operating profit</p>
              </div>
              <div className="relative min-w-[178px] rounded-2xl border border-white/[0.12] bg-white/[0.07] px-4 py-3 text-right backdrop-blur-sm">
                <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-white/60">30-day cash outlook</p>
                <p className="mt-1 text-lg font-semibold tracking-[-0.035em]">{formatNaira(stats.dueNext30Days - stats.projectedExpenses30Days)}</p>
              </div>
            </div>
            <div className="relative mt-6 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-white/[0.14] pt-5 sm:grid-cols-4">
              <div><p className="text-[10px] font-medium text-white/55">Sales</p><p className="mt-1.5 text-sm font-semibold tracking-[-0.02em]">{formatNaira(stats.weeklySales)}</p></div>
              <div><p className="text-[10px] font-medium text-white/55">Expenses</p><p className="mt-1.5 text-sm font-semibold tracking-[-0.02em]">{formatNaira(stats.weeklyExpenses)}</p></div>
              <div><p className="text-[10px] font-medium text-white/55">Invoice dues · 30d</p><p className="mt-1.5 text-sm font-semibold tracking-[-0.02em]">{formatNaira(stats.dueNext30Days)}</p></div>
              <div><p className="text-[10px] font-medium text-white/55">Low-stock products</p><p className="mt-1.5 text-sm font-semibold tracking-[-0.02em]">{stats.lowStockCount}</p></div>
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
