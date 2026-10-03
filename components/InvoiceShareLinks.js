'use client';

import { useState } from 'react';

function formatNaira(value) {
  return `₦${Number(value || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
}

function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('0')) return `234${digits.slice(1)}`;
  if (digits.length === 10) return `234${digits}`;
  return digits;
}

export default function InvoiceShareLinks({ token, invoiceNumber, balance, phone }) {
  const [shareError, setShareError] = useState('');

  if (!token) return null;

  async function handleShare() {
    setShareError('');
    const baseUrl = window.location.origin;
    const pdfUrl = new URL(`/api/invoices/public/${encodeURIComponent(token)}`, baseUrl).toString();
    const payUrl = new URL(`/invoice/pay/${encodeURIComponent(token)}`, baseUrl).toString();
    const message = `Hello, please find invoice ${invoiceNumber}. Balance due: ${formatNaira(balance)}. Pay securely: ${payUrl}`;
    const whatsappMessage = `${message}\nDownload invoice PDF: ${pdfUrl}`;
    const whatsapp = new URL('https://wa.me/');
    const phoneNumber = normalizePhone(phone);
    let fallbackMessage = 'This browser cannot attach the PDF directly. WhatsApp will open with a link to download it.';
    if (phoneNumber) whatsapp.pathname = `/${phoneNumber}`;
    whatsapp.searchParams.set('text', whatsappMessage);

    if (typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && typeof File !== 'undefined') {
      try {
        const response = await fetch(pdfUrl);
        if (!response.ok) {
          throw new Error(`Could not retrieve the invoice PDF (HTTP ${response.status}).`);
        }

        const pdf = await response.blob();
        const safeInvoiceNumber = String(invoiceNumber || 'invoice').replace(/[^\w.-]+/g, '-');
        const file = new File([pdf], `invoice-${safeInvoiceNumber}.pdf`, { type: 'application/pdf' });

        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: `Invoice ${invoiceNumber}`, text: message });
          return;
        }
      } catch (error) {
        if (error.name === 'AbortError') return;
        fallbackMessage = 'Could not attach the PDF directly. WhatsApp will open with a link to download it instead.';
      }
    }

    setShareError(fallbackMessage);
    window.open(whatsapp.toString(), '_blank', 'noopener,noreferrer');
  }

  function handleReminder() {
    const baseUrl = window.location.origin;
    const payUrl = new URL(`/invoice/pay/${encodeURIComponent(token)}`, baseUrl).toString();
    const pdfUrl = new URL(`/api/invoices/public/${encodeURIComponent(token)}`, baseUrl).toString();
    const message = `Hello, this is a friendly reminder that invoice ${invoiceNumber} has a balance of ${formatNaira(balance)}. You can view the invoice here: ${pdfUrl} and pay securely here: ${payUrl}`;
    const whatsapp = new URL('https://wa.me/');
    const phoneNumber = normalizePhone(phone);
    if (phoneNumber) whatsapp.pathname = `/${phoneNumber}`;
    whatsapp.searchParams.set('text', message);
    window.open(whatsapp.toString(), '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={handleShare} className="btn-secondary text-sm">
        Share via WhatsApp
      </button>
      <button type="button" onClick={handleReminder} className="btn-secondary text-sm">
        Send payment reminder
      </button>
      {shareError && <p role="alert" className="basis-full text-xs text-red-600">{shareError}</p>}
    </div>
  );
}
