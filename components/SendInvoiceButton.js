'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SendInvoiceButton({ invoiceId, isQuote = false }) {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState('');

  async function handleSend() {
    setSending(true);
    setStatus('');

    try {
      const response = await fetch(`/api/invoices/send?id=${encodeURIComponent(invoiceId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId }),
      });

      const text = await response.text();
      let result = {};

      if (text) {
        try {
          result = JSON.parse(text);
        } catch {
          result = { error: response.ok ? '' : `Invoice send failed (HTTP ${response.status}).` };
        }
      }

      if (result?.email) {
        const historyMessage = result.historyError ? ` ${result.historyError}` : '';
        setStatus(`${result.email.message || (result.email.ok ? 'Invoice email sent.' : 'Invoice email was not sent.')}${historyMessage}`);
        router.refresh();
      } else {
        throw new Error(result?.error || `Invoice send failed (HTTP ${response.status}).`);
      }
    } catch (error) {
      setStatus(error.message || 'Failed to send invoice.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={handleSend}
        disabled={sending}
        className="rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {sending ? 'Sending...' : `Send ${isQuote ? 'quote' : 'invoice'} by email`}
      </button>
      {status && <div className="text-xs text-slate-500">{status}</div>}
    </div>
  );
}
