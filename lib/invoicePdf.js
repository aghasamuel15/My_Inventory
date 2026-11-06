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
  const contentWidth = pageWidth - margin * 2;
  const customer = invoice.customer || {};
  const invoiceNumber = invoice.invoice_number || invoice.id;
  const paidTotal = getInvoicePaidTotal(invoice);
  const balance = getInvoiceBalance(invoice);
  const isQuote = invoice.document_type === 'quote';
  const status = isQuote ? 'QUOTE' : balance <= 0 ? 'PAID' : String(invoice.status || 'unpaid').toUpperCase();
  const logoDataUrl = await loadLogoDataUrl(profile?.business_logo_url);
  let y = 0;

  function ensureSpace(height) {
    if (y + height > pageHeight - margin) {
      doc.addPage();
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, pageWidth, 8, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);
      doc.text(`${isQuote ? 'QUOTE' : 'INVOICE'} #${invoiceNumber}`, margin, 30);
      doc.setFont('helvetica', 'normal');
      doc.text('CONTINUED', pageWidth - margin, 30, { align: 'right' });
      doc.setDrawColor(226, 232, 240);
      doc.line(margin, 40, pageWidth - margin, 40);
      y = 58;
    }
  }

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 148, 'F');
  doc.setFillColor(79, 70, 229);
  doc.rect(pageWidth - 10, 0, 10, 148, 'F');

  if (logoDataUrl) {
    const logoFormat = logoDataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(margin, 38, 54, 54, 10, 10, 'F');
    doc.addImage(logoDataUrl, logoFormat, margin + 4, 42, 46, 46);
  }

  const businessName = profile?.business_name || 'My Business';
  const businessX = logoDataUrl ? margin + 68 : margin;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(19);
  doc.setTextColor(255, 255, 255);
  doc.text(doc.splitTextToSize(businessName, 240).slice(0, 2), businessX, 61);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(199, 210, 254);
  doc.text('PAYMENT DOCUMENT', businessX, 91);

  const titleX = pageWidth - margin;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(25);
  doc.setTextColor(255, 255, 255);
  doc.text(isQuote ? 'QUOTE' : 'INVOICE', titleX, 48, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(226, 232, 240);
  doc.text(doc.splitTextToSize(`#${invoiceNumber}`, 205), titleX, 66, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  const statusWidth = Math.max(62, doc.getTextWidth(status) + 22);
  const statusX = pageWidth - margin - statusWidth;
  doc.setFillColor(balance <= 0 ? 6 : 51, balance <= 0 ? 95 : 65, balance <= 0 ? 70 : 85);
  doc.roundedRect(statusX, 91, statusWidth, 22, 11, 11, 'F');
  doc.setTextColor(255, 255, 255);
  doc.text(status, statusX + statusWidth / 2, 105, { align: 'center' });

  y = 166;
  const cardGap = 12;
  const cardWidth = (contentWidth - cardGap) / 2;
  const cardHeight = 91;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, y, cardWidth, cardHeight, 10, 10, 'FD');
  doc.roundedRect(margin + cardWidth + cardGap, y, cardWidth, cardHeight, 10, 10, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('BILLED TO', margin + 14, y + 19);
  doc.text('DOCUMENT DETAILS', margin + cardWidth + cardGap + 14, y + 19);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(doc.splitTextToSize(String(customer.name || 'Customer'), cardWidth - 28).slice(0, 1), margin + 14, y + 39);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  [customer.email, customer.phone, customer.address].filter(Boolean).slice(0, 2).forEach((detail, index) => {
    const lines = doc.splitTextToSize(String(detail), cardWidth - 28);
    doc.text(lines.slice(0, 1), margin + 14, y + 56 + index * 14);
  });

  const detailsX = margin + cardWidth + cardGap + 14;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text('Issue date', detailsX, y + 42);
  doc.text(String(invoice.issue_date || '—'), detailsX + cardWidth - 42, y + 42, { align: 'right' });
  doc.text('Due date', detailsX, y + 62);
  doc.text(String(invoice.due_date || '—'), detailsX + cardWidth - 42, y + 62, { align: 'right' });
  y += cardHeight + 28;

  const columns = {
    description: margin + 12,
    quantity: margin + 286,
    unitPrice: pageWidth - margin - 120,
    amount: pageWidth - margin - 12,
  };
  function drawTableHeader() {
    doc.setFillColor(238, 242, 255);
    doc.roundedRect(margin, y, contentWidth, 30, 7, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text('DESCRIPTION', columns.description, y + 19);
    doc.text('QTY', columns.quantity, y + 19, { align: 'right' });
    doc.text('UNIT PRICE', columns.unitPrice, y + 19, { align: 'right' });
    doc.text('AMOUNT', columns.amount, y + 19, { align: 'right' });
    y += 30;
  }
  ensureSpace(34);
  drawTableHeader();

  const items = invoice.items?.length ? invoice.items : [{
    description: invoice.description || invoice.notes || 'Invoice amount',
    quantity: 1,
    unit_price: invoice.total,
    amount: invoice.total,
  }];
  for (const [index, item] of items.entries()) {
    const descriptionLines = doc.splitTextToSize(String(item.description || 'Item'), 225);
    const rowHeight = Math.max(34, descriptionLines.length * 13 + 18);
    const pageBeforeRow = doc.internal.getNumberOfPages();
    ensureSpace(rowHeight + 1);
    if (doc.internal.getNumberOfPages() !== pageBeforeRow) drawTableHeader();

    doc.setFillColor(index % 2 === 0 ? 255 : 248, index % 2 === 0 ? 255 : 250, index % 2 === 0 ? 255 : 252);
    doc.rect(margin, y, contentWidth, rowHeight, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);
    doc.text(descriptionLines, columns.description, y + 20);
    doc.text(String(Number(item.quantity || 0)), columns.quantity, y + 20, { align: 'right' });
    doc.text(formatMoney(item.unit_price), columns.unitPrice, y + 20, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(formatMoney(item.amount), columns.amount, y + 20, { align: 'right' });
    y += rowHeight;
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y, pageWidth - margin, y);
  }

  y += 20;
  const totalsHeight = 144;
  ensureSpace(totalsHeight);
  const totalsWidth = 248;
  const totalsX = pageWidth - margin - totalsWidth;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(totalsX, y, totalsWidth, totalsHeight, 10, 10, 'FD');
  const labelX = totalsX + 15;
  const valueX = totalsX + totalsWidth - 15;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text('Subtotal', labelX, y + 23);
  doc.text(formatMoney(invoice.subtotal ?? invoice.total), valueX, y + 23, { align: 'right' });
  doc.text('Tax', labelX, y + 43);
  doc.text(formatMoney(invoice.tax || 0), valueX, y + 43, { align: 'right' });

  doc.setDrawColor(203, 213, 225);
  doc.line(labelX, y + 54, valueX, y + 54);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('Total', labelX, y + 72);
  doc.text(formatMoney(invoice.total || 0), valueX, y + 72, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text('Paid', labelX, y + 94);
  doc.text(formatMoney(paidTotal), valueX, y + 94, { align: 'right' });

  doc.setFillColor(balance <= 0 ? 220 : 224, balance <= 0 ? 252 : 231, balance <= 0 ? 231 : 255);
  doc.roundedRect(totalsX + 8, y + 105, totalsWidth - 16, 31, 7, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(balance <= 0 ? 6 : 49, balance <= 0 ? 95 : 46, balance <= 0 ? 70 : 129);
  doc.text(balance <= 0 ? 'PAID IN FULL' : 'BALANCE DUE', labelX, y + 124);
  doc.setFontSize(10);
  doc.text(formatMoney(balance), valueX - 2, y + 124, { align: 'right' });
  y += totalsHeight;

  if (invoice.notes) {
    y += 28;
    const noteLines = doc.splitTextToSize(String(invoice.notes), contentWidth - 28);
    const notesHeight = noteLines.length * 13 + 32;
    ensureSpace(notesHeight);
    doc.setFillColor(255, 251, 235);
    doc.setDrawColor(253, 230, 138);
    doc.roundedRect(margin, y, contentWidth, notesHeight, 8, 8, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(120, 53, 15);
    doc.text('NOTE', margin + 14, y + 17);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text(noteLines, margin + 14, y + 34);
    y += notesHeight;
  }

  return { doc, filename: `invoice-${invoiceNumber}.pdf` };
}