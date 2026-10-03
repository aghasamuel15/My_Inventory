'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../lib/supabaseClient';

const today = new Date().toISOString().slice(0, 10);
const blankItem = () => ({ description: '', quantity: '1', unit_price: '' });

const formatNaira = (value) => `₦${Number(value || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;

export default function InvoiceCreateForm({ customers }) {
  const router = useRouter();
  const supabase = createClient();
  const [customerId, setCustomerId] = useState('');
  const [issueDate, setIssueDate] = useState(today);
  const [dueDate, setDueDate] = useState('');
  const [tax, setTax] = useState('0');
  const [notes, setNotes] = useState('');
  const [documentType, setDocumentType] = useState('invoice');
  const [items, setItems] = useState([blankItem()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const subtotal = useMemo(() => items.reduce(
    (sum, item) => sum + Math.round(Number(item.quantity || 0) * Number(item.unit_price || 0) * 100) / 100,
    0
  ), [items]);
  const total = subtotal + (Math.round(Number(tax || 0) * 100) / 100);

  function updateItem(index, field, value) {
    setItems((current) => current.map((item, itemIndex) => (
      itemIndex === index ? { ...item, [field]: value } : item
    )));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');

    const cleanedItems = items.map((item) => ({
      description: item.description.trim(),
      quantity: Number(item.quantity),
      unit_price: Number(item.unit_price),
    }));

    if (cleanedItems.some((item) => (
      !item.description || !Number.isFinite(item.quantity) || item.quantity <= 0
      || !Number.isFinite(item.unit_price) || item.unit_price < 0
    ))) {
      setError('Each item needs a description, quantity above zero, and a valid unit price.');
      setSaving(false);
      return;
    }

    const { data: invoiceId, error: createError } = await supabase.rpc('create_invoice_with_items', {
      p_customer_id: customerId,
      p_issue_date: issueDate || null,
      p_due_date: dueDate || null,
      p_tax: Number(tax || 0),
      p_notes: notes,
      p_items: cleanedItems,
      p_document_type: documentType,
    });

    setSaving(false);
    if (createError) {
      setError(createError.message || 'Could not create invoice.');
      return;
    }
    if (!invoiceId) {
      setError('Invoice was not created. Please try again.');
      return;
    }

    router.push(`/dashboard/invoices/${invoiceId}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="card mb-8 space-y-5">
      <div className="grid gap-4 md:grid-cols-4">
        <div>
          <label className="label" htmlFor="invoice-document-type">Document type</label>
          <select id="invoice-document-type" className="input" value={documentType} onChange={(event) => setDocumentType(event.target.value)}>
            <option value="invoice">Invoice</option>
            <option value="quote">Quote / estimate</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="invoice-customer">Customer</label>
          <select id="invoice-customer" className="input" required value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
            <option value="">Select a customer</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>{customer.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="invoice-issue-date">Issue date</label>
          <input id="invoice-issue-date" className="input" type="date" required value={issueDate} onChange={(event) => setIssueDate(event.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="invoice-due-date">Due date</label>
          <input id="invoice-due-date" className="input" type="date" min={issueDate} value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">Items</h2>
          <button type="button" onClick={() => setItems((current) => [...current, blankItem()])} className="text-sm font-semibold text-brand-700 hover:underline">
            Add item
          </button>
        </div>
        <div className="space-y-3">
          {items.map((item, index) => (
            <div key={index} className="grid gap-3 rounded-xl border border-slate-200 p-3 md:grid-cols-[minmax(0,1fr)_130px_160px_150px_auto] md:items-end">
              <div>
                <label className="label" htmlFor={`item-description-${index}`}>Description</label>
                <input id={`item-description-${index}`} className="input" required value={item.description} onChange={(event) => updateItem(index, 'description', event.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor={`item-quantity-${index}`}>Quantity</label>
                <input id={`item-quantity-${index}`} className="input" type="number" min="0.01" step="0.01" required value={item.quantity} onChange={(event) => updateItem(index, 'quantity', event.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor={`item-price-${index}`}>Unit price (₦)</label>
                <input id={`item-price-${index}`} className="input" type="number" min="0" step="0.01" required value={item.unit_price} onChange={(event) => updateItem(index, 'unit_price', event.target.value)} />
              </div>
              <div className="pb-2 text-sm font-medium text-slate-700">
                Amount: {formatNaira(Math.round(Number(item.quantity || 0) * Number(item.unit_price || 0) * 100) / 100)}
              </div>
              <button type="button" disabled={items.length === 1} onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove item ${index + 1}`} className="pb-2 text-sm text-red-600 disabled:cursor-not-allowed disabled:opacity-40">
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="invoice-notes">Notes</label>
          <textarea id="invoice-notes" className="input min-h-24" value={notes} onChange={(event) => setNotes(event.target.value)} />
        </div>
        <div className="space-y-3 md:ml-auto md:w-full md:max-w-sm">
          <div>
            <label className="label" htmlFor="invoice-tax">Tax (₦)</label>
            <input id="invoice-tax" className="input" type="number" min="0" step="0.01" value={tax} onChange={(event) => setTax(event.target.value)} />
          </div>
          <div className="space-y-1 border-t border-slate-200 pt-3 text-sm">
            <div className="flex justify-between"><span>Subtotal</span><span>{formatNaira(subtotal)}</span></div>
            <div className="flex justify-between"><span>Tax</span><span>{formatNaira(tax)}</span></div>
            <div className="flex justify-between text-base font-bold"><span>Total</span><span>{formatNaira(total)}</span></div>
          </div>
        </div>
      </div>

      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <button type="submit" disabled={saving || customers.length === 0} className="btn-primary disabled:cursor-not-allowed disabled:opacity-60">
        {saving ? 'Creating document...' : documentType === 'quote' ? 'Create quote' : 'Create invoice'}
      </button>
      {customers.length === 0 && <p className="text-sm text-amber-700">Add a customer before creating an invoice.</p>}
    </form>
  );
}
