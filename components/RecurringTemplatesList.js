'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../lib/supabaseClient';

export default function RecurringTemplatesList({ templates }) {
  const supabase = createClient();
  const router = useRouter();
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState('');

  async function updateTemplate(template, active) {
    setSavingId(template.id);
    setError('');
    const { error: updateError } = await supabase
      .from('recurring_invoice_templates')
      .update({ active })
      .eq('id', template.id);
    setSavingId('');
    if (updateError) setError(updateError.message);
    else router.refresh();
  }

  async function deleteTemplate(template) {
    if (!window.confirm(`Delete the recurring schedule for ${template.customer?.name || 'this customer'}? Existing invoices will remain.`)) return;
    setSavingId(template.id);
    setError('');
    const { error: deleteError } = await supabase
      .from('recurring_invoice_templates')
      .delete()
      .eq('id', template.id);
    setSavingId('');
    if (deleteError) setError(deleteError.message);
    else router.refresh();
  }

  return (
    <div className="card">
      {error && <p role="alert" className="mb-3 text-sm text-red-700">{error}</p>}
      {templates.length === 0 ? <p className="text-sm text-slate-500">No recurring schedules yet. Create one from an invoice.</p> : (
        <div className="divide-y divide-slate-100">
          {templates.map((template) => (
            <div key={template.id} className="flex flex-wrap items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
              <div>
                <div className="font-semibold text-slate-900">{template.customer?.name || 'Customer'} · {template.frequency}</div>
                <div className="text-sm text-slate-500">Next draft: {template.next_issue_date} · {template.items?.length || 0} item(s)</div>
                <div className={`mt-1 text-xs font-semibold uppercase ${template.active ? 'text-emerald-700' : 'text-slate-500'}`}>{template.active ? 'Active' : 'Paused'}</div>
              </div>
              <div className="flex gap-3">
                <button type="button" disabled={savingId === template.id} onClick={() => updateTemplate(template, !template.active)} className="text-sm font-semibold text-brand-700 disabled:opacity-60">
                  {template.active ? 'Pause' : 'Resume'}
                </button>
                <button type="button" disabled={savingId === template.id} onClick={() => deleteTemplate(template)} className="text-sm font-semibold text-red-700 disabled:opacity-60">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
