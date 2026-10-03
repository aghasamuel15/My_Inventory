"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../../../lib/supabaseClient";

function naira(n) {
  return `₦${Number(n || 0).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
}

export default function NewInvoicePage() {
  const supabase = createClient();
  const router = useRouter();
  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState(`INV-${Date.now().toString().slice(-6)}`);
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [tax, setTax] = useState(0);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState([{ description: "", quantity: 1, unit_price: 0 }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data } = await supabase.from("customers").select("id, name").eq("user_id", user.id).order("name");
      setCustomers(data || []);
    })();
  }, []);

  function updateItem(i, field, value) {
    const next = [...items];
    next[i][field] = value;
    setItems(next);
  }

  function addItem() {
    setItems([...items, { description: "", quantity: 1, unit_price: 0 }]);
  }

  function removeItem(i) {
    setItems(items.filter((_, idx) => idx !== i));
  }

  const subtotal = items.reduce((acc, it) => acc + Number(it.quantity || 0) * Number(it.unit_price || 0), 0);
  const total = subtotal + Number(tax || 0);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      setSaving(false);
      alert('Please sign in again to create an invoice.');
      return;
    }

    const { data: invoice, error } = await supabase
      .from("invoices")
      .insert({
        user_id: user.id,
        customer_id: customerId || null,
        invoice_number: invoiceNumber,
        issue_date: issueDate,
        due_date: dueDate || null,
        subtotal,
        tax: Number(tax || 0),
        total,
        total_amount: total,
        notes,
        status: "unpaid",
      })
      .select()
      .single();

    if (error) {
      setSaving(false);
      alert(error.message);
      return;
    }

    const itemRows = items
      .filter((it) => it.description)
      .map((it) => ({
        invoice_id: invoice.id,
        description: it.description,
        quantity: Number(it.quantity),
        unit_price: Number(it.unit_price),
        amount: Number(it.quantity) * Number(it.unit_price),
      }));

    if (itemRows.length) {
      await supabase.from("invoice_items").insert(itemRows);
    }

    setSaving(false);
    router.push(`/dashboard/invoices/${invoice.id}`);
  }

  return (
    <div>
      <h1 className="text-xl font-bold mb-6">New invoice</h1>

      <form onSubmit={handleSubmit} className="space-y-6 max-w-3xl">
        <div className="card grid sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Invoice number</label>
            <input className="input" required value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
          </div>
          <div>
            <label className="label">Customer</label>
            <select className="input" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">Select customer</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Issue date</label>
            <input className="input" type="date" required value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
          </div>
          <div>
            <label className="label">Due date</label>
            <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>

        <div className="card">
          <h2 className="font-semibold mb-3">Items</h2>
          <div className="space-y-3">
            {items.map((it, i) => (
              <div key={i} className="grid sm:grid-cols-12 gap-2 items-end">
                <div className="sm:col-span-6">
                  <label className="label">Description</label>
                  <input className="input" required value={it.description}
                    onChange={(e) => updateItem(i, "description", e.target.value)} />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Qty</label>
                  <input className="input" type="number" min="0" step="0.01" value={it.quantity}
                    onChange={(e) => updateItem(i, "quantity", e.target.value)} />
                </div>
                <div className="sm:col-span-3">
                  <label className="label">Unit price (₦)</label>
                  <input className="input" type="number" min="0" step="0.01" value={it.unit_price}
                    onChange={(e) => updateItem(i, "unit_price", e.target.value)} />
                </div>
                <div className="sm:col-span-1">
                  <button type="button" onClick={() => removeItem(i)} className="text-red-500 text-xs">✕</button>
                </div>
              </div>
            ))}
          </div>
          <button type="button" onClick={addItem} className="btn-secondary mt-4 text-sm">+ Add item</button>
        </div>

        <div className="card grid sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Tax (₦)</label>
            <input className="input" type="number" min="0" step="0.01" value={tax} onChange={(e) => setTax(e.target.value)} />
          </div>
          <div>
            <label className="label">Notes</label>
            <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="sm:col-span-2 text-right text-lg font-bold">
            Total: {naira(total)}
          </div>
        </div>

        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? "Creating..." : "Create invoice"}
        </button>
      </form>
    </div>
  );
}