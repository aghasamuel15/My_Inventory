"use client";

import { useEffect, useState } from "react";
import { createClient } from "../../../lib/supabaseClient";

function naira(n) {
  return `₦${Number(n || 0).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
}

const CATEGORIES = ["stock", "rent", "transport", "salaries", "utilities", "general", "other"];

export default function ExpensesPage() {
  const supabase = createClient();
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    description: "",
    amount: "",
    category: "general",
    expense_date: new Date().toISOString().slice(0, 10),
  });
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data } = await supabase.from("expenses").select("*").eq("user_id", user.id).order("expense_date", { ascending: false }).limit(100);
    setExpenses(data || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase.from("expenses").insert({
      user_id: user.id,
      description: form.description,
      amount: Number(form.amount),
      category: form.category,
      expense_date: form.expense_date,
    });

    setSaving(false);
    if (!error) {
      setForm({ ...form, description: "", amount: "" });
      load();
    } else {
      alert(error.message);
    }
  }

  async function handleDelete(id) {
    if (!confirm("Delete this expense?")) return;
    await supabase.from("expenses").delete().eq("id", id);
    load();
  }

  return (
    <div>
      <h1 className="text-xl font-bold mb-6">Expenses</h1>

      <form onSubmit={handleSubmit} className="card mb-8 grid sm:grid-cols-5 gap-3 items-end">
        <div className="sm:col-span-2">
          <label className="label">Description</label>
          <input className="input" required value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. Fuel for generator" />
        </div>
        <div>
          <label className="label">Amount (₦)</label>
          <input className="input" type="number" min="0" step="0.01" required value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        </div>
        <div>
          <label className="label">Category</label>
          <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Date</label>
          <input className="input" type="date" required value={form.expense_date}
            onChange={(e) => setForm({ ...form, expense_date: e.target.value })} />
        </div>
        <div className="sm:col-span-5">
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? "Saving..." : "Record expense"}
          </button>
        </div>
      </form>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="py-2">Date</th>
                <th>Description</th>
                <th>Category</th>
                <th className="text-right">Amount</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((x) => (
                <tr key={x.id} className="border-b last:border-0">
                  <td className="py-2">{x.expense_date}</td>
                  <td>{x.description}</td>
                  <td className="capitalize">{x.category}</td>
                  <td className="text-right font-medium">{naira(x.amount)}</td>
                  <td className="text-right">
                    <button onClick={() => handleDelete(x.id)} className="text-red-500 text-xs">Delete</button>
                  </td>
                </tr>
              ))}
              {expenses.length === 0 && (
                <tr><td colSpan={5} className="py-6 text-center text-gray-400">No expenses recorded yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}