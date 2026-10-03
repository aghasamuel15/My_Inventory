'use client';

import { useEffect, useState } from 'react';
import { createClient } from '../../lib/supabaseClient';
import StatCard from '../../components/StatCard';
import { getInvoiceBalance } from '../../lib/invoiceBalance';

const formatNaira = (value) => `₦${Number(value || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;

export default function DashboardPage() {
  const supabase = createClient();
  const [stats, setStats] = useState({
    todaySales: 0,
    todayExpenses: 0,
    weeklyProfit: 0,
    outstandingBalance: 0,
    overdueBalance: 0,
    overdueCount: 0,
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

      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
      const weekStart = new Date(today.getTime() - (today.getDay() || 7) * 24 * 60 * 60 * 1000);
      weekStart.setHours(0, 0, 0, 0);

      const results = await Promise.all([
        supabase.from('sales').select('amount').eq('user_id', user.id).gte('sale_date', startOfDay),
        supabase.from('expenses').select('amount').eq('user_id', user.id).gte('expense_date', startOfDay),
        supabase.from('sales').select('amount').eq('user_id', user.id).gte('sale_date', weekStart.toISOString()),
        supabase.from('expenses').select('amount').eq('user_id', user.id).gte('expense_date', weekStart.toISOString()),
        supabase.from('invoices').select('total, due_date, status, document_type, payments:invoice_payments(amount)').eq('user_id', user.id),
      ]);
      const queryError = results.find((result) => result.error)?.error;
      if (queryError) {
        setError(queryError.message || 'Could not load dashboard totals.');
        setLoading(false);
        return;
      }
      const [salesToday, expensesToday, salesWeek, expensesWeek, invoices] = results;

      const todaySalesValue = (salesToday.data || []).reduce((sum, item) => sum + Number(item.amount || 0), 0);
      const todayExpensesValue = (expensesToday.data || []).reduce((sum, item) => sum + Number(item.amount || 0), 0);
      const weeklySalesValue = (salesWeek.data || []).reduce((sum, item) => sum + Number(item.amount || 0), 0);
      const weeklyExpensesValue = (expensesWeek.data || []).reduce((sum, item) => sum + Number(item.amount || 0), 0);
      const todayDate = today.toISOString().slice(0, 10);
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

      setStats({
        todaySales: todaySalesValue,
        todayExpenses: todayExpensesValue,
        weeklyProfit: weeklySalesValue - weeklyExpensesValue,
        outstandingBalance: debtValue,
        overdueBalance: overdueValue,
        overdueCount: overdueInvoices.length,
      });
      setLoading(false);
    }

    load();
  }, [supabase]);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Dashboard</h1>

      {loading ? (
        <div className="text-slate-500">Loading overview...</div>
      ) : error ? (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <StatCard label="Sales today" value={formatNaira(stats.todaySales)} tone="brand" />
          <StatCard label="Expenses today" value={formatNaira(stats.todayExpenses)} tone="red" />
          <StatCard label="Weekly profit" value={formatNaira(stats.weeklyProfit)} tone="emerald" />
          <StatCard label="Outstanding invoices" value={formatNaira(stats.outstandingBalance)} tone="amber" />
          <StatCard label={`Overdue invoices (${stats.overdueCount})`} value={formatNaira(stats.overdueBalance)} tone="red" />
        </div>
      )}
    </div>
  );
}
