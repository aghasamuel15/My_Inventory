'use client';

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
  if (!token) return null;

  function handleShare() {
    const payUrl = new URL(`/invoice/pay/${encodeURIComponent(token)}`, window.location.origin).toString();
    const message = `Hello, please find invoice ${invoiceNumber}. Balance due: ${formatNaira(balance)}. Pay securely or view invoice: ${payUrl}`;
    const whatsapp = new URL('https://wa.me/');
    const phoneNumber = normalizePhone(phone);
    if (phoneNumber) whatsapp.pathname = `/${phoneNumber}`;
    whatsapp.searchParams.set('text', message);
    window.open(whatsapp.toString(), '_blank', 'noopener,noreferrer');
  }

  return (
    <button type="button" onClick={handleShare} className="btn-secondary text-sm">
      Share via WhatsApp
    </button>
  );
}
