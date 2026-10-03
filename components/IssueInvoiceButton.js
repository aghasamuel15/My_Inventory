'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../lib/supabaseClient';

export default function IssueInvoiceButton({ invoiceId }) {
  const supabase = createClient();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleIssue() {
    setSaving(true);
    setError('');
    const { error: updateError } = await supabase
      .from('invoices')
      .update({ status: 'unpaid' })
      .eq('id', invoiceId)
      .eq('document_type', 'invoice')
      .eq('status', 'draft');
    setSaving(false);
    if (updateError) setError(updateError.message);
    else router.refresh();
  }

  return (
    <div>
      <button type="button" disabled={saving} onClick={handleIssue} className="btn-primary disabled:opacity-60">
        {saving ? 'Issuing...' : 'Issue invoice'}
      </button>
      {error && <p role="alert" className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}
