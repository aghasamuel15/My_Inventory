"use client";

import { useState } from 'react';
import { createInvoicePdf } from './lib/invoicePdf';

export default function PrintButton({ invoice, profile }) {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleDownloadPdf() {
    setLoading(true);
    setError('');
    try {
      const { doc, filename } = await createInvoicePdf(invoice, profile);
      doc.save(filename);
    } catch (pdfError) {
      setError(pdfError.message || 'Could not generate invoice PDF.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button onClick={handleDownloadPdf} disabled={loading} className="btn-secondary text-sm disabled:opacity-60">
        {loading ? 'Preparing PDF...' : 'Download PDF'}
      </button>
      {error && <p role="alert" className="mt-1 max-w-xs text-xs text-red-700">{error}</p>}
    </div>
  );
}