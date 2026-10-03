'use client';

import { useState } from 'react';

export default function PayInvoiceButton({ token, compact = false }) {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handlePay() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/invoices/pay/${encodeURIComponent(token)}/initialize`, { method: 'POST' });
      const result = await response.json();
      if (!response.ok || !result.authorizationUrl) {
        throw new Error(result.error || 'Could not start payment.');
      }
      window.location.assign(result.authorizationUrl);
    } catch (paymentError) {
      setError(paymentError.message || 'Could not start payment.');
      setLoading(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={handlePay} disabled={loading} className={`btn-primary disabled:opacity-60 ${compact ? 'text-sm' : ''}`}>
        {loading ? 'Opening secure checkout...' : 'Pay invoice online'}
      </button>
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
