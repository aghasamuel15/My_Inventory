"use client";

import { useState } from "react";
import Papa from "papaparse";
import { createClient } from "../../../lib/supabaseClient";

function naira(n) {
  return `₦${Number(n || 0).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
}

function downloadCSV(rows, filename) {
  const csv = Papa.unparse(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  const supabase = createClient();
  const [from, setFrom] = useState(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);

  async function runReport() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();

    const [salesRes, expensesRes] = await Promise.all([
      supabase.from("sales").select("*").eq("user_id", user.id).gte("sale_date", from).lte("sale_date", to).order("sale_date"),
      supabase.from("expenses").select("*").eq("user_id", user.id).gte("expense_date", from).lte("expense_date", to).order("expense_date"),
    ]);

    const sales = salesRes.data || [];
    const expenses = expensesRes.data || [];
    const totalSales = sales.reduce((a, r) => a + Number(r.amount), 0);
    const totalExpenses = expenses.reduce((a, r) => a + Number(r.amount), 0);

    setSummary({ sales, expenses, totalSales, totalExpenses, profit: totalSales - totalExpenses });
    setLoading(false);
  }

  function exportSales() {
    if (!summary) return;
    downloadCSV(
      summary.sales.map((s) => ({ Date: s.sale_date, Description: s.description, Amount: s.amount, "Payment Method": s.payment_method })),
      `sales_${from}_to_${to}.csv`
    );
  }

  function exportExpenses() {
    if (!summary) return;
    downloadCSV(
      summary.expenses.map((x) => ({ Date: x.expense_date, Description: x.description, Category: x.category, Amount: x.amount })),
      `expenses_${from}_to_${to}.csv`
    );
  }

  return (
    <div>
      <h1 className="text-xl font-bold mb-6">Reports</h1>

      <div className="card mb-8 flex flex-wrap gap-4 items-end">
        <div>
          <label className="label">From</label>
          <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="label">To</label>
          <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <button onClick={runReport} disabled={loading} className="btn-primary">
          {loading ? "Running..." : "Run report"}
        </button>
      </div>

      {summary && (
        <>
          <div className="grid sm:grid-cols-3 gap-4 mb-6">
            <div className="card"><div className="text-sm text-gray-500">Total sales</div><div className="text-xl font-bold">{naira(summary.totalSales)}</div></div>
            <div className="card"><div className="text-sm text-gray-500">Total expenses</div><div className="text-xl font-bold">{naira(summary.totalExpenses)}</div></div>
            <div className="card"><div className="text-sm text-gray-500">Profit</div><div className={`text-xl font-bold ${summary.profit >= 0 ? "text-brand-700" : "text-red-600"}`}>{naira(summary.profit)}</div></div>
          </div>

          <div className="flex gap-3">
            <button onClick={exportSales} className="btn-secondary text-sm">Export sales CSV</button>
            <button onClick={exportExpenses} className="btn-secondary text-sm">Export expenses CSV</button>
          </div>
        </>
      )}
    </div>
  );
}