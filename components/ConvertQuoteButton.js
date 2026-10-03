'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../lib/supabaseClient';

export default function ConvertQuoteButton({ invoiceId }) {
  const router = useRouter();
  const supabase = createClient();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleConvert() {
    setSaving(true);
    setError('');
    const { error: updateError } = await supabase
      .from('invoices')
      .update({ document_type: 'invoice', status: 'unpaid' })
      .eq('id', invoiceId)
      .eq('document_type', 'quote');
    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <button type="button" disabled={saving} onClick={handleConvert} className="btn-primary text-sm disabled:opacity-60">
        {saving ? 'Converting...' : 'Convert to invoice'}
      </button>
      {error && <p role="alert" className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}
