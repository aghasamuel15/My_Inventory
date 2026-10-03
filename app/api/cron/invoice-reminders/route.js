import { timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { createInvoiceEmailTransporter, invoiceEmailFrom } from '../../../../lib/invoiceEmail';
import { createInvoiceLinkToken } from '../../../../lib/invoiceLink';
import { getInvoiceBalance, getInvoicePaidTotal } from '../../../../lib/invoiceBalance';

export const runtime = 'nodejs';

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

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

function createPublicInvoiceUrl(invoiceId) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const token = createInvoiceLinkToken(invoiceId);
  if (!siteUrl || !token) return '';

  try {
    const baseUrl = new URL(siteUrl);
    if (baseUrl.protocol !== 'https:') return '';
    return new URL(`/api/invoices/public/${encodeURIComponent(token)}`, baseUrl).toString();
  } catch {
    return '';
  }
}

export async function GET(request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'Scheduled invoice reminders are not configured.' }, { status: 503 });
  }

  const authorization = request.headers.get('authorization') || '';
  const bearerToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!bearerToken || !safeEqual(bearerToken, cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Reminder database access is not configured.' }, { status: 503 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const reminderDate = new Date().toISOString().slice(0, 10);
  const { data: invoices, error: invoicesError } = await supabase
    .from('invoices')
    .select('id, user_id, invoice_number, total, due_date, status, customer:customers(name, email), payments:invoice_payments(amount)')
    .eq('document_type', 'invoice')
    .neq('status', 'draft')
    .lt('due_date', reminderDate)
    .or('status.is.null,status.neq.paid')
    .order('due_date');

  if (invoicesError) {
    return NextResponse.json({ error: `Could not load overdue invoices: ${invoicesError.message}` }, { status: 500 });
  }

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let transporter;

  for (const invoice of invoices || []) {
    const paidTotal = getInvoicePaidTotal(invoice);
    const balance = getInvoiceBalance(invoice);
    const recipient = invoice.customer?.email || '';

    if (balance <= 0 || !recipient) {
      skipped += 1;
      continue;
    }

    const { data: reminder, error: reserveError } = await supabase
      .from('invoice_email_logs')
      .insert({
        invoice_id: invoice.id,
        user_id: invoice.user_id,
        email_type: 'reminder',
        recipient,
        status: 'sending',
        reminder_date: reminderDate,
      })
      .select('id')
      .single();

    if (reserveError?.code === '23505') {
      skipped += 1;
      continue;
    }
    if (reserveError || !reminder) {
      failed += 1;
      continue;
    }

    try {
      transporter ||= createInvoiceEmailTransporter();
      const invoiceNumber = invoice.invoice_number || invoice.id;
      const customerName = invoice.customer?.name || 'Customer';
      const publicPdfUrl = createPublicInvoiceUrl(invoice.id);
      const publicPayUrl = publicPdfUrl
        ? new URL(`/invoice/pay/${encodeURIComponent(createInvoiceLinkToken(invoice.id))}`, process.env.NEXT_PUBLIC_SITE_URL).toString()
        : '';
      const linkHtml = publicPdfUrl
        ? `<p><a href="${escapeHtml(publicPdfUrl)}">View or download the invoice</a></p><p><a href="${escapeHtml(publicPayUrl)}">Pay invoice securely online</a></p>`
        : '';
      const html = `
        <div style="font-family: Arial, sans-serif; color: #1f2937;">
          <h2>Payment reminder: invoice #${escapeHtml(invoiceNumber)}</h2>
          <p>Hello ${escapeHtml(customerName)},</p>
          <p>This is a friendly reminder that invoice #${escapeHtml(invoiceNumber)} is overdue.</p>
          <p><strong>Due date:</strong> ${escapeHtml(invoice.due_date)}</p>
          <p><strong>Original total:</strong> ${formatMoney(invoice.total)}</p>
          <p><strong>Paid:</strong> ${formatMoney(paidTotal)}</p>
          <p><strong>Balance due:</strong> ${formatMoney(balance)}</p>
          ${linkHtml}
        </div>
      `;
      const text = `Hello ${customerName},\n\nThis is a friendly reminder that invoice #${invoiceNumber} is overdue.\nDue date: ${invoice.due_date}\nOriginal total: ${formatMoney(invoice.total)}\nPaid: ${formatMoney(paidTotal)}\nBalance due: ${formatMoney(balance)}${publicPdfUrl ? `\nView or download the invoice: ${publicPdfUrl}\nPay invoice securely online: ${publicPayUrl}` : ''}`;

      await transporter.sendMail({
        from: invoiceEmailFrom(),
        to: recipient,
        subject: `Payment reminder: invoice #${invoiceNumber}`,
        html,
        text,
      });

      const { error: updateError } = await supabase
        .from('invoice_email_logs')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', reminder.id);
      if (updateError) {
        failed += 1;
      } else {
        sent += 1;
      }
    } catch (error) {
      const { error: updateError } = await supabase
        .from('invoice_email_logs')
        .update({ status: 'failed', error: error.message || 'Reminder delivery failed.' })
        .eq('id', reminder.id);
      failed += 1;
      if (updateError) {
        console.error(`Failed to save reminder result for invoice ${invoice.id}:`, updateError.message);
      }
    }
  }

  const { data: templates, error: templatesError } = await supabase
    .from('recurring_invoice_templates')
    .select('id')
    .eq('active', true)
    .lte('next_issue_date', reminderDate);
  if (templatesError) {
    return NextResponse.json({ error: `Reminders finished, but recurring schedules could not be loaded: ${templatesError.message}` }, { status: 500 });
  }

  let generatedDrafts = 0;
  let recurringFailed = 0;
  for (const template of templates || []) {
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const { data: generatedId, error: generationError } = await supabase.rpc('generate_recurring_invoice_draft', {
        p_template_id: template.id,
        p_today: reminderDate,
      });
      if (generationError) {
        recurringFailed += 1;
        console.error(`Failed to generate recurring invoice for template ${template.id}:`, generationError.message);
        break;
      }
      if (!generatedId) break;
      generatedDrafts += 1;
    }
  }

  return NextResponse.json({
    ok: failed === 0 && recurringFailed === 0,
    reminderDate,
    sent,
    failed,
    skipped,
    generatedDrafts,
    recurringFailed,
  });
}
