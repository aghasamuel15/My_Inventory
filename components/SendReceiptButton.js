'use client';

import { useState } from 'react';

export default function SendReceiptButton({ paymentId }) {
  const [status, setStatus] = useState('');
  const [sending, setSending] = useState(false);

  async function handleSend() {
    setSending(true);
    setStatus('');
    try {
      const response = await fetch('/api/invoices/receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not send receipt.');
      setStatus('Receipt sent.');
    } catch (error) {
      setStatus(error.message || 'Could not send receipt.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mt-2">
      <button type="button" onClick={handleSend} disabled={sending} className="text-xs font-semibold text-brand-700 disabled:opacity-60">
        {sending ? 'Sending...' : 'Send / retry receipt'}
      </button>
      {status && <p role="status" className="text-xs text-slate-500">{status}</p>}
    </div>
  );
}
