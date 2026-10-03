import { jsPDF } from 'jspdf';
import { getInvoiceBalance, getInvoicePaidTotal } from './invoiceBalance';

function formatMoney(value) {
  return `NGN ${Number(value || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
}

async function loadLogoDataUrl(logoUrl) {
  if (!logoUrl) return null;

  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!projectUrl) throw new Error('Supabase URL is required to load the business logo.');

  const logo = new URL(logoUrl);
  const project = new URL(projectUrl);
  if (
    logo.origin !== project.origin
    || !logo.pathname.includes('/storage/v1/object/public/business-logos/')
  ) {
    throw new Error('The business logo URL is invalid. Upload the logo again in Business profile settings.');
  }

  const response = await fetch(logo);
  if (!response.ok) throw new Error('Could not load the business logo for the invoice PDF.');
  const mimeType = response.headers.get('content-type')?.split(';')[0];
  if (!['image/png', 'image/jpeg'].includes(mimeType)) {
    throw new Error('The business logo must be a PNG or JPEG image.');
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > 2 * 1024 * 1024) {
    throw new Error('The business logo exceeds the 2 MB limit.');
  }

  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }

  return `data:${mimeType};base64,${btoa(binary)}`;
}

export async function createInvoicePdf(invoice, profile) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 42;
  const customer = invoice.customer || {};
  const invoiceNumber = invoice.invoice_number || invoice.id;
  const paidTotal = getInvoicePaidTotal(invoice);
  const balance = getInvoiceBalance(invoice);
  const logoDataUrl = await loadLogoDataUrl(profile?.business_logo_url);
  let y = 54;

  function ensureSpace(height) {
    if (y + height > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  if (logoDataUrl) {
    const logoFormat = logoDataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
    doc.addImage(logoDataUrl, logoFormat, margin, 38, 54, 54);
    doc.text(profile?.business_name || 'My Business', margin + 68, 70);
    y = 116;
  } else {
    doc.text(profile?.business_name || 'My Business', margin, y);
    y += 28;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(`${invoice.document_type === 'quote' ? 'Quote' : 'Invoice'} #${invoiceNumber}`, margin, y);
  doc.text(`Status: ${invoice.status || 'unpaid'}`, pageWidth - margin, y, { align: 'right' });
  y += 20;
  doc.text(`Issue date: ${invoice.issue_date || '—'}`, margin, y);
  doc.text(`Due date: ${invoice.due_date || '—'}`, pageWidth - margin, y, { align: 'right' });
  y += 30;

  doc.setFont('helvetica', 'bold');
  doc.text('Billed to', margin, y);
  y += 17;
  doc.setFont('helvetica', 'normal');
  for (const detail of [customer.name, customer.email, customer.phone, customer.address].filter(Boolean)) {
    const lines = doc.splitTextToSize(String(detail), pageWidth - margin * 2);
    ensureSpace(lines.length * 15);
    doc.text(lines, margin, y);
    y += lines.length * 15;
  }
  y += 20;

  const columns = {
    description: margin,
    quantity: pageWidth - 230,
    unitPrice: pageWidth - 155,
    amount: pageWidth - margin,
  };
  ensureSpace(24);
  doc.setFont('helvetica', 'bold');
  doc.text('Description', columns.description, y);
  doc.text('Qty', columns.quantity, y, { align: 'right' });
  doc.text('Unit price', columns.unitPrice, y, { align: 'right' });
  doc.text('Amount', columns.amount, y, { align: 'right' });
  y += 10;
  doc.setDrawColor(210);
  doc.line(margin, y, pageWidth - margin, y);
  y += 17;
  doc.setFont('helvetica', 'normal');

  for (const item of invoice.items || []) {
    const descriptionLines = doc.splitTextToSize(String(item.description || 'Item'), 205);
    const rowHeight = Math.max(17, descriptionLines.length * 14);
    ensureSpace(rowHeight + 4);
    doc.text(descriptionLines, columns.description, y);
    doc.text(String(item.quantity || 0), columns.quantity, y, { align: 'right' });
    doc.text(formatMoney(item.unit_price), columns.unitPrice, y, { align: 'right' });
    doc.text(formatMoney(item.amount), columns.amount, y, { align: 'right' });
    y += rowHeight + 4;
  }

  y += 18;
  ensureSpace(110);
  doc.setFont('helvetica', 'normal');
  doc.text('Subtotal', pageWidth - 180, y);
  doc.text(formatMoney(invoice.subtotal || 0), pageWidth - margin, y, { align: 'right' });
  y += 18;
  doc.text('Tax', pageWidth - 180, y);
  doc.text(formatMoney(invoice.tax || 0), pageWidth - margin, y, { align: 'right' });
  y += 20;
  doc.setFont('helvetica', 'bold');
  doc.text('Total', pageWidth - 180, y);
  doc.text(formatMoney(invoice.total || 0), pageWidth - margin, y, { align: 'right' });
  y += 18;
  doc.setFont('helvetica', 'normal');
  doc.text('Paid', pageWidth - 180, y);
  doc.text(formatMoney(paidTotal), pageWidth - margin, y, { align: 'right' });
  y += 18;
  doc.setFont('helvetica', 'bold');
  doc.text('Balance due', pageWidth - 180, y);
  doc.text(formatMoney(balance), pageWidth - margin, y, { align: 'right' });

  if (invoice.notes) {
    y += 32;
    ensureSpace(35);
    doc.setFont('helvetica', 'bold');
    doc.text('Notes', margin, y);
    y += 16;
    doc.setFont('helvetica', 'normal');
    doc.text(doc.splitTextToSize(String(invoice.notes), pageWidth - margin * 2), margin, y);
  }

  return { doc, filename: `invoice-${invoiceNumber}.pdf` };
}