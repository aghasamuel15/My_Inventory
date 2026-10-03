"use client";

import { useEffect, useState } from "react";
import { createClient } from "../../../lib/supabaseClient";

function naira(n) {
  return `₦${Number(n || 0).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
}

export default function SalesPage() {
  const supabase = createClient();
  const [sales, setSales] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    description: "",
    amount: "",
    payment_method: "cash",
    customer_id: "",
    sale_date: new Date().toISOString().slice(0, 10),
  });
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    const [salesRes, customersRes] = await Promise.all([
      supabase.from("sales").select("*, customers(name)").eq("user_id", user.id).order("sale_date", { ascending: false }).limit(100),
      supabase.from("customers").select("id, name").eq("user_id", user.id).order("name"),
    ]);
    setSales(salesRes.data || []);
    setCustomers(customersRes.data || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase.from("sales").insert({
      user_id: user.id,
      description: form.description,
      amount: Number(form.amount),
      payment_method: form.payment_method,
      customer_id: form.customer_id || null,
      sale_date: form.sale_date,
    });

    setSaving(false);
    if (!error) {
      setForm({ ...form, description: "", amount: "", customer_id: "" });
      load();
    } else {
      alert(error.message);
    }
  }

  async function handleDelete(id) {
    if (!confirm("Delete this sale?")) return;
    await supabase.from("sales").delete().eq("id", id);
    load();
  }

  return (
    <div>
      <h1 className="text-xl font-bold mb-6">Sales</h1>

      <form onSubmit={handleSubmit} className="card mb-8 grid sm:grid-cols-5 gap-3 items-end">
        <div className="sm:col-span-2">
          <label className="label">Description</label>
          <input className="input" required value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. 2 bags of rice" />
        </div>
        <div>
          <label className="label">Amount (₦)</label>
          <input className="input" type="number" min="0" step="0.01" required value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        </div>
        <div>
          <label className="label">Customer (optional)</label>
          <select className="input" value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value })}>
            <option value="">Walk-in / none</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Date</label>
          <input className="input" type="date" required value={form.sale_date}
            onChange={(e) => setForm({ ...form, sale_date: e.target.value })} />
        </div>
        <div className="sm:col-span-5">
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? "Saving..." : "Record sale"}
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
                <th>Customer</th>
                <th>Method</th>
                <th className="text-right">Amount</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sales.map((s) => (
                <tr key={s.id} className="border-b last:border-0">
                  <td className="py-2">{s.sale_date}</td>
                  <td>{s.description}</td>
                  <td>{s.customers?.name || "—"}</td>
                  <td className="capitalize">{s.payment_method}</td>
                  <td className="text-right font-medium">{naira(s.amount)}</td>
                  <td className="text-right">
                    <button onClick={() => handleDelete(s.id)} className="text-red-500 text-xs">Delete</button>
                  </td>
                </tr>
              ))}
              {sales.length === 0 && (
                <tr><td colSpan={6} className="py-6 text-center text-gray-400">No sales recorded yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}