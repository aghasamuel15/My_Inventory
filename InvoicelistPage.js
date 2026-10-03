"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "../../../lib/supabaseClient";

function naira(n) {
  return `₦${Number(n || 0).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
}

const statusColor = {
  paid: "bg-brand-50 text-brand-700",
  unpaid: "bg-red-50 text-red-600",
  partial: "bg-yellow-50 text-yellow-700",
};

export default function InvoicesPage() {
  const supabase = createClient();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data } = await supabase
      .from("invoices")
      .select("*, customers(name)")
      .eq("user_id", user.id)
      .order("issue_date", { ascending: false });
    setInvoices(data || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function markPaid(id) {
    await supabase.from("invoices").update({ status: "paid" }).eq("id", id);
    load();
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-bold">Invoices</h1>
        <Link href="/dashboard/invoices/new" className="btn-primary">+ New invoice</Link>
      </div>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="py-2">Invoice #</th>
                <th>Customer</th>
                <th>Issue date</th>
                <th>Status</th>
                <th className="text-right">Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-b last:border-0">
                  <td className="py-2">
                    <Link href={`/dashboard/invoices/${inv.id}`} className="text-brand-700 font-medium">
                      {inv.invoice_number}
                    </Link>
                  </td>
                  <td>{inv.customers?.name || "—"}</td>
                  <td>{inv.issue_date}</td>
                  <td>
                    <span className={`px-2 py-1 rounded-full text-xs capitalize ${statusColor[inv.status]}`}>
                      {inv.status}
                    </span>
                  </td>
                  <td className="text-right font-medium">{naira(inv.total)}</td>
                  <td className="text-right">
                    {inv.status !== "paid" && (
                      <button onClick={() => markPaid(inv.id)} className="text-brand-600 text-xs">Mark paid</button>
                    )}
                  </td>
                </tr>
              ))}
              {invoices.length === 0 && (
                <tr><td colSpan={6} className="py-6 text-center text-gray-400">No invoices yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
