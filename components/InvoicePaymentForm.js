'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../lib/supabaseClient';

const today = new Date().toISOString().slice(0, 10);

export default function InvoicePaymentForm({ invoiceId, balance }) {
  const router = useRouter();
  const supabase = createClient();
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(today);
  const [method, setMethod] = useState('cash');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setStatus('');

    try {
      const { data: paymentId, error: paymentError } = await supabase.rpc('record_invoice_payment', {
        p_invoice_id: invoiceId,
        p_amount: Number(amount),
        p_payment_date: paymentDate || null,
        p_method: method,
        p_reference: reference,
        p_notes: notes,
      });
      if (paymentError) throw new Error(paymentError.message || 'Could not record payment.');

      let receiptMessage = 'Payment recorded.';
      if (paymentId) {
        try {
          const response = await fetch('/api/invoices/receipt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paymentId }),
          });
          const receiptResult = await response.json();
          if (!response.ok) {
            receiptMessage = `Payment recorded, but the receipt email failed: ${receiptResult.error || 'Please retry the receipt.'}`;
          } else {
            receiptMessage = 'Payment recorded and receipt emailed.';
          }
        } catch (receiptError) {
          receiptMessage = `Payment recorded, but the receipt email failed: ${receiptError.message || 'Please retry the receipt.'}`;
        }
      }

      setAmount('');
      setReference('');
      setNotes('');
      setStatus(receiptMessage);
      router.refresh();
    } catch (paymentError) {
      setError(paymentError.message || 'Could not record payment.');
    } finally {
      setSaving(false);
    }
  }

  if (balance <= 0) {
    return <p className="text-sm font-medium text-emerald-700">This invoice is fully paid.</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="payment-amount">Amount received (₦)</label>
          <input id="payment-amount" className="input" type="number" min="0.01" max={balance} step="0.01" required value={amount} onChange={(event) => setAmount(event.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="payment-date">Payment date</label>
          <input id="payment-date" className="input" type="date" required value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="payment-method">Method</label>
          <select id="payment-method" className="input" value={method} onChange={(event) => setMethod(event.target.value)}>
            <option value="cash">Cash</option>
            <option value="bank_transfer">Bank transfer</option>
            <option value="card">Card</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="payment-reference">Reference (optional)</label>
          <input id="payment-reference" className="input" value={reference} onChange={(event) => setReference(event.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="payment-notes">Notes (optional)</label>
          <input id="payment-notes" className="input" value={notes} onChange={(event) => setNotes(event.target.value)} />
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {status && <p role="status" className={`text-sm ${status.startsWith('Payment recorded and') ? 'text-emerald-700' : 'text-amber-700'}`}>{status}</p>}
      <button type="submit" disabled={saving} className="btn-primary disabled:opacity-60">
        {saving ? 'Recording...' : 'Record payment'}
      </button>
    </form>
  );
}
