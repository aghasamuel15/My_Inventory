import { NextResponse } from 'next/server';
import { createInvoicePdf } from '../../../../lib/invoicePdf';
import { createInvoiceLinkToken } from '../../../../lib/invoiceLink';
import { createInvoiceEmailTransporter, invoiceEmailFrom } from '../../../../lib/invoiceEmail';
import { getInvoiceBalance, getInvoicePaidTotal } from '../../../../lib/invoiceBalance';
import { createServerSupabaseClient } from '../../../../lib/supabaseServer';

function formatMoney(value) {
  return `₦${Number(value || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

export async function POST(request) {
  try {
    const { searchParams } = new URL(request.url);
    const urlInvoiceId = searchParams.get('id');
    let invoiceId = urlInvoiceId;

    if (!invoiceId) {
      const contentType = request.headers.get('content-type') || '';

      if (contentType.includes('application/json')) {
        try {
          const body = await request.json();
          invoiceId = body?.invoiceId || null;
        } catch {
          invoiceId = null;
        }
      }
    }

    if (!invoiceId) {
      return NextResponse.json({ ok: false, error: 'Invoice ID is required.' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('*, customer:customers(name, email, phone), items:invoice_items(*), payments:invoice_payments(amount)')
      .eq('id', invoiceId)
      .eq('user_id', user.id)
      .single();

    if (invoiceError || !invoice) {
      return NextResponse.json({ ok: false, error: 'Invoice not found.' }, { status: 404 });
    }
    if (invoice.document_type === 'invoice' && invoice.status === 'draft') {
      return NextResponse.json({ ok: false, error: 'Issue this invoice before sending it.' }, { status: 409 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('business_name, business_logo_url')
      .eq('id', user.id)
      .maybeSingle();

    const { doc, filename } = await createInvoicePdf(invoice, profile);
    const pdf = Buffer.from(doc.output('arraybuffer'));
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    const signingToken = createInvoiceLinkToken(invoice.id);
    let publicPdfUrl = '';
    let publicPayUrl = '';

    if (siteUrl && signingToken) {
      try {
        const baseUrl = new URL(siteUrl);
        if (baseUrl.protocol === 'https:') {
          publicPdfUrl = new URL(
            `/api/invoices/public/${encodeURIComponent(signingToken)}`,
            baseUrl
          ).toString();
          if (invoice.document_type !== 'quote' && getInvoiceBalance(invoice) > 0) {
            publicPayUrl = new URL(
              `/invoice/pay/${encodeURIComponent(signingToken)}`,
              baseUrl
            ).toString();
          }
        }
      } catch {
        publicPdfUrl = '';
      }
    }

    const customerName = invoice.customer?.name || 'Customer';
    const customerEmail = invoice.customer?.email || '';
    const invoiceNumber = invoice.invoice_number || invoice.id;

    const emailResults = {
      ok: false,
      message: !customerEmail
        ? 'Email not sent: the customer does not have an email address.'
        : 'Email not sent: SMTP settings are missing.',
    };

    if (customerEmail) {
      const paidTotal = getInvoicePaidTotal(invoice);
      const balance = getInvoiceBalance(invoice);
      const mailHtml = `
        <div style="font-family: Arial, sans-serif; color: #1f2937;">
          <h2>${invoice.document_type === 'quote' ? 'Quote' : 'Invoice'} #${escapeHtml(invoiceNumber)}</h2>
          <p>Hello ${escapeHtml(customerName)},</p>
          <p>Your ${invoice.document_type === 'quote' ? 'quote' : 'invoice'} PDF is attached to this email.</p>
          <p><strong>Total:</strong> ${formatMoney(invoice.total || 0)}</p>
          <p><strong>Paid:</strong> ${formatMoney(paidTotal)}</p>
          <p><strong>Balance due:</strong> ${formatMoney(balance)}</p>
          <p><strong>Due date:</strong> ${invoice.due_date || '—'}</p>
          ${publicPdfUrl ? `<p><a href="${escapeHtml(publicPdfUrl)}">View or download invoice PDF</a></p>` : ''}
          ${publicPayUrl ? `<p><a href="${escapeHtml(publicPayUrl)}">Pay invoice securely online</a></p>` : ''}
        </div>
      `;

      try {
        const transporter = createInvoiceEmailTransporter();
        await transporter.sendMail({
          from: invoiceEmailFrom(),
          to: customerEmail,
          subject: `${invoice.document_type === 'quote' ? 'Quote' : 'Invoice'} #${invoiceNumber}`,
          html: mailHtml,
          text: `Hello ${customerName},\n\nYour ${invoice.document_type === 'quote' ? 'quote' : 'invoice'} #${invoiceNumber} is attached as a PDF.\nTotal: ${formatMoney(invoice.total || 0)}\nPaid: ${formatMoney(paidTotal)}\nBalance due: ${formatMoney(balance)}\nDue date: ${invoice.due_date || '—'}${publicPdfUrl ? `\nView or download it here: ${publicPdfUrl}` : ''}${publicPayUrl ? `\nPay securely online: ${publicPayUrl}` : ''}`,
          attachments: [{ filename, content: pdf, contentType: 'application/pdf' }],
        });
        emailResults.ok = true;
        emailResults.message = 'Invoice email sent.';
      } catch (emailError) {
        emailResults.ok = false;
        emailResults.message = emailError.message || 'Failed to send email.';
      }
    }

    let historyError = null;
    const { error: logError } = await supabase.from('invoice_email_logs').insert({
      invoice_id: invoice.id,
      user_id: user.id,
      email_type: 'invoice',
      recipient: customerEmail || 'No customer email',
      status: emailResults.ok ? 'sent' : 'failed',
      error: emailResults.ok ? null : emailResults.message,
      sent_at: emailResults.ok ? new Date().toISOString() : null,
    });
    if (logError) {
      historyError = 'Email could not be added to invoice history.';
    }

    return NextResponse.json({
      ok: emailResults.ok,
      email: emailResults,
      historyError,
      invoiceId,
    }, { status: emailResults.ok ? 200 : 502 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message || 'Unexpected send failure.' }, { status: 500 });
  }
}
