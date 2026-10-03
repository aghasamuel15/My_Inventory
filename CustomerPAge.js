"use client";

import { useEffect, useState } from "react";
import { createClient } from "../../../lib/supabaseClient";

function naira(n) {
  return `₦${Number(n || 0).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
}

export default function CustomersPage() {
  const supabase = createClient();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: "", phone: "", email: "", address: "" });
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();

    const { data: customersData } = await supabase
      .from("customers")
      .select("*")
      .eq("user_id", user.id)
      .order("name");

    const { data: invoicesData } = await supabase
      .from("invoices")
      .select("customer_id, total, status")
      .eq("user_id", user.id)
      .in("status", ["unpaid", "partial"]);

    const owedByCustomer = {};
    (invoicesData || []).forEach((inv) => {
      if (!inv.customer_id) return;
      owedByCustomer[inv.customer_id] = (owedByCustomer[inv.customer_id] || 0) + Number(inv.total);
    });

    setCustomers((customersData || []).map((c) => ({ ...c, owed: owedByCustomer[c.id] || 0 })));
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase.from("customers").insert({ user_id: user.id, ...form });

    setSaving(false);
    if (!error) {
      setForm({ name: "", phone: "", email: "", address: "" });
      load();
    } else {
      alert(error.message);
    }
  }

  async function handleDelete(id) {
    if (!confirm("Delete this customer?")) return;
    await supabase.from("customers").delete().eq("id", id);
    load();
  }

  const totalOwed = customers.reduce((acc, c) => acc + c.owed, 0);

  return (
    <div>
      <h1 className="text-xl font-bold mb-6">Customers</h1>

      <form onSubmit={handleSubmit} className="card mb-8 grid sm:grid-cols-5 gap-3 items-end">
        <div>
          <label className="label">Name</label>
          <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className="label">Phone</label>
          <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <div>
          <label className="label">Email</label>
          <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div>
          <label className="label">Address</label>
          <input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </div>
        <button type="submit" disabled={saving} className="btn-primary h-fit">
          {saving ? "Saving..." : "Add customer"}
        </button>
      </form>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : (
        <>
          <div className="mb-4 text-sm text-gray-600">
            Total owed to you: <span className="font-semibold text-red-600">{naira(totalOwed)}</span>
          </div>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="py-2">Name</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th className="text-right">Owes you</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="py-2">{c.name}</td>
                    <td>{c.phone || "—"}</td>
                    <td>{c.email || "—"}</td>
                    <td className={`text-right font-medium ${c.owed > 0 ? "text-red-600" : ""}`}>{naira(c.owed)}</td>
                    <td className="text-right">
                      <button onClick={() => handleDelete(c.id)} className="text-red-500 text-xs">Delete</button>
                    </td>
                  </tr>
                ))}
                {customers.length === 0 && (
                  <tr><td colSpan={5} className="py-6 text-center text-gray-400">No customers yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}