'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const formatNaira = (value) => `₦${Number(value || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;

export default function VerifyInvoicePayment({ token, reference }) {
  const [status, setStatus] = useState('verifying');
  const [receipt, setReceipt] = useState(null);
  const [warning, setWarning] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function verify() {
      if (!token || !reference) {
        setError('Payment reference is missing. If you completed payment, contact the business with your Paystack receipt.');
        setStatus('error');
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
        if (cancelled) return;

        setReceipt(result.receipt || null);
        setStatus('success');
        const messages = [];
        if (result.receiptError) messages.push(`The payment is confirmed, but the email receipt could not be sent: ${result.receiptError}`);
        else if (result.receiptEmailSent === false) messages.push('The payment is confirmed, but the email receipt could not be sent. Please contact the business for a copy.');
        if (result.overpayment > 0) {
          messages.push(`${formatNaira(result.overpayment)} was received in excess. Please contact the business to arrange a refund.`);
        }
        setWarning(messages.join(' '));
      } catch (verificationError) {
        if (!cancelled) {
          setError(verificationError.message || 'Payment verification failed.');
          setStatus('error');
        }
      }
    }

    verify();
    return () => { cancelled = true; };
  }, [reference, token]);

  return (
    <div>
      {status === 'verifying' && (
        <div role="status" className="flex items-center gap-3 rounded-2xl border border-[#e5ebe4] bg-[#fbfcfa] px-4 py-4 text-sm text-[#52665a]">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#cbd9ce] border-t-[#176b52]" />
          Confirming your payment securely…
        </div>
      )}

      {status === 'error' && (
        <div role="alert" className="rounded-2xl border border-[#efd4d0] bg-[#fcf4f2] p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f7e4e1] text-[#a9483e]">
              <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true"><path d="M10 6v4M10 13.5h.01M10 2.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            </span>
            <div>
              <p className="font-semibold text-[#873d35]">We couldn’t confirm this payment yet</p>
              <p className="mt-1 text-sm leading-6 text-[#8e5c55]">{error}</p>
              <p className="mt-2 text-xs leading-5 text-[#8e5c55]">If your account was charged, please keep your Paystack receipt and contact the business before trying again.</p>
            </div>
          </div>
        </div>
      )}

      {status === 'success' && (
        <section aria-labelledby="payment-confirmed-title" className="overflow-hidden rounded-[22px] border border-[#e3e9e2] bg-white shadow-[0_8px_24px_rgba(31,51,41,0.04)]">
          <div className="bg-gradient-to-br from-[#163c30] via-[#12392e] to-[#0d2b22] px-5 py-6 text-white sm:px-7">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#b8d7bb]/30 bg-[#b8d7bb]/10 text-[#c2e0c3]">
                <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true"><path d="m5 10 3.2 3.2L15.5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /><circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.3" /></svg>
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#d5c293]">Payment confirmed</p>
                <h2 id="payment-confirmed-title" className="mt-1 text-xl font-semibold tracking-[-0.035em] sm:text-2xl">Thank you{receipt?.customerName ? `, ${receipt.customerName}` : ''}</h2>
                <p className="mt-1 text-sm text-white/65">Your payment has been added to the invoice.</p>
              </div>
            </div>
            {receipt && (
              <div className="mt-5 rounded-2xl border border-white/[0.12] bg-white/[0.07] px-4 py-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/60">Amount received</p>
                <p className="mt-1 text-2xl font-semibold tracking-[-0.045em] sm:text-3xl">{formatNaira(receipt.paymentAmount)}</p>
                <p className="mt-1 text-xs text-white/55">For invoice #{receipt.invoiceNumber}</p>
              </div>
            )}
          </div>

          <div className="p-4 sm:p-6">
            {receipt && (
              <>
                <dl className="overflow-hidden rounded-2xl border border-[#e5ebe4] bg-[#fbfcfa]">
                  <div className="flex items-start justify-between gap-4 border-b border-[#e8ede7] px-4 py-3.5 text-sm">
                    <dt className="shrink-0 text-[#738078]">Payment date</dt>
                    <dd className="text-right font-medium text-[#2c4035]">{receipt.paymentDate || '—'}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-4 border-b border-[#e8ede7] px-4 py-3.5 text-sm">
                    <dt className="shrink-0 text-[#738078]">Reference</dt>
                    <dd className="max-w-[65%] break-all text-right font-medium text-[#2c4035]">{receipt.paymentReference || '—'}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-4 border-b border-[#e8ede7] px-4 py-3.5 text-sm">
                    <dt className="shrink-0 text-[#738078]">Invoice total</dt>
                    <dd className="text-right font-medium text-[#2c4035]">{formatNaira(receipt.invoiceTotal)}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-4 px-4 py-3.5 text-sm">
                    <dt className="shrink-0 text-[#738078]">Paid to date</dt>
                    <dd className="text-right font-medium text-[#2c4035]">{formatNaira(receipt.paidTotal)}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-4 border-t border-[#e1e9e0] bg-[#f1f7f1] px-4 py-4">
                    <dt className="text-sm font-semibold text-[#315d48]">Remaining balance</dt>
                    <dd className="text-right text-base font-bold text-[#176b52]">{formatNaira(receipt.balanceRemaining)}</dd>
                  </div>
                </dl>

                <div className={`mt-4 flex items-center gap-2 rounded-xl px-3.5 py-3 text-xs font-medium ${
                  warning ? 'border border-[#f0dfc0] bg-[#fbf6eb] text-[#805f2f]' : 'border border-[#dce8df] bg-[#f1f7f1] text-[#315d48]'
                }`}>
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
                  {warning || 'A payment receipt has been emailed to you.'}
                </div>
              </>
            )}
            {!receipt && (
              <p role="status" className="rounded-xl border border-[#dce8df] bg-[#f1f7f1] px-4 py-3 text-sm text-[#315d48]">
                Your payment is confirmed. Please keep your Paystack transaction reference for your records.
              </p>
            )}

            {token && (
              <Link href={`/invoice/pay/${encodeURIComponent(token)}`} className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl border border-[#dce4de] px-4 text-sm font-semibold text-[#315d48] transition hover:bg-[#f7faf7]">
                Return to invoice
              </Link>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
