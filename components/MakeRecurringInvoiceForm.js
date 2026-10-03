'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '../lib/supabaseClient';

export default function MakeRecurringInvoiceForm({ invoice }) {
  const supabase = createClient();
  const [frequency, setFrequency] = useState('monthly');
  const [nextIssueDate, setNextIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDays, setDueDays] = useState('14');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      setError(authError?.message || 'Please sign in again.');
      setSaving(false);
      return;
    }

    const { error: insertError } = await supabase.from('recurring_invoice_templates').insert({
      user_id: user.id,
      customer_id: invoice.customer_id,
      frequency,
      next_issue_date: nextIssueDate,
      due_days: Number(dueDays),
      tax: Number(invoice.tax || 0),
      notes: invoice.notes || null,
      items: (invoice.items || []).map((item) => ({
        description: item.description,
        quantity: Number(item.quantity),
        unit_price: Number(item.unit_price),
      })),
    });
    setSaving(false);
    if (insertError) {
      setError(insertError.message);
    } else {
      setCreated(true);
    }
  }

  if (created) {
    return <p className="text-sm text-emerald-700">Recurring schedule created. Future invoices will be generated as drafts. <Link className="font-semibold underline" href="/dashboard/invoices/recurring">Manage schedules</Link></p>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="recurring-frequency">Frequency</label>
          <select id="recurring-frequency" className="input" value={frequency} onChange={(event) => setFrequency(event.target.value)}>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="yearly">Yearly</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="recurring-first-date">Next issue date</label>
          <input id="recurring-first-date" type="date" className="input" required min={new Date().toISOString().slice(0, 10)} value={nextIssueDate} onChange={(event) => setNextIssueDate(event.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="recurring-due-days">Payment terms (days)</label>
          <input id="recurring-due-days" type="number" className="input" min="0" max="365" required value={dueDays} onChange={(event) => setDueDays(event.target.value)} />
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <button type="submit" disabled={saving} className="btn-secondary disabled:opacity-60">
        {saving ? 'Creating schedule...' : 'Create recurring schedule'}
      </button>
    </form>
  );
}
