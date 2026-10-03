'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function VerifyInvoicePayment({ token, reference }) {
  const [message, setMessage] = useState('Confirming your payment...');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function verify() {
      if (!token || !reference) {
        setError('Payment reference is missing. If you completed payment, contact the business with your Paystack receipt.');
        setMessage('');
        return;
      }

      try {
        const response = await fetch('/api/invoices/pay/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, reference }),
        });
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.error || 'Payment could not be confirmed.');
        if (!cancelled) {
          setMessage(result.overpayment > 0
            ? `Payment received. The invoice was already partly paid when checkout completed; ${new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(result.overpayment)} is in excess. Please contact the business to arrange a refund.`
            : result.receiptError
            ? `Payment received. ${result.receiptError}`
            : 'Payment received successfully. A receipt has been emailed to you.');
          if (result.receiptError) setError(result.receiptError);
        }
      } catch (verificationError) {
        if (!cancelled) {
          setMessage('');
          setError(verificationError.message || 'Payment verification failed.');
        }
      }
    }

    verify();
    return () => { cancelled = true; };
  }, [reference, token]);

  return (
    <div>
      {message && <p role="status" className="text-emerald-700">{message}</p>}
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <Link href="/" className="mt-5 inline-block text-sm font-medium text-brand-700 hover:underline">Return to home</Link>
    </div>
  );
}
