import { createInvoiceEmailTransporter, invoiceEmailFrom } from './invoiceEmail';

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

export async function sendInvoicePaymentReceipt(supabase, invoice, payment) {
  const recipient = invoice.customer?.email || '';
  if (!recipient) throw new Error('Payment was recorded, but the customer has no email address for a receipt.');

  let { data: log, error: logError } = await supabase
    .from('invoice_email_logs')
    .select('id, status')
    .eq('payment_id', payment.id)
    .eq('email_type', 'receipt')
    .maybeSingle();

  if (logError) throw new Error(`Could not check receipt history: ${logError.message}`);
  if (log?.status === 'sent') return { sent: true, alreadySent: true };

  if (log) {
    const { error: updateError } = await supabase
      .from('invoice_email_logs')
      .update({ status: 'sending', error: null, sent_at: null })
      .eq('id', log.id);
    if (updateError) throw new Error(`Could not update receipt history: ${updateError.message}`);
  } else {
    const { data: insertedLog, error: insertError } = await supabase
      .from('invoice_email_logs')
      .insert({
        invoice_id: invoice.id,
        user_id: invoice.user_id,
        email_type: 'receipt',
        recipient,
        payment_id: payment.id,
        status: 'sending',
      })
      .select('id')
      .single();

    if (insertError?.code === '23505') {
      const { data: existingLog, error: existingLogError } = await supabase
        .from('invoice_email_logs')
        .select('id, status')
        .eq('payment_id', payment.id)
        .eq('email_type', 'receipt')
        .maybeSingle();
      if (existingLogError) throw new Error(`Could not check receipt history: ${existingLogError.message}`);
      if (existingLog?.status === 'sent') return { sent: true, alreadySent: true };
      throw new Error('The payment receipt is already being processed. Please check the email history shortly.');
    }
    if (insertError) throw new Error(`Could not create receipt history: ${insertError.message}`);
    log = insertedLog;
  }

  const invoiceNumber = invoice.invoice_number || invoice.id;
  const paymentReference = payment.reference || payment.id;
  const businessName = invoice.profile?.business_name || 'My Business';
  const receiptHtml = `
    <div style="font-family: Arial, sans-serif; color: #1f2937;">
      <h2>Payment receipt for invoice #${escapeHtml(invoiceNumber)}</h2>
      <p>Hello ${escapeHtml(invoice.customer?.name || 'Customer')},</p>
      <p>We received your payment of <strong>${formatMoney(payment.amount)}</strong>.</p>
      <p><strong>Payment date:</strong> ${escapeHtml(payment.payment_date)}</p>
      <p><strong>Reference:</strong> ${escapeHtml(paymentReference)}</p>
      <p><strong>Invoice balance remaining:</strong> ${formatMoney(invoice.balanceRemaining)}</p>
      <p>Thank you,<br>${escapeHtml(businessName)}</p>
    </div>
  `;

  try {
    const transporter = createInvoiceEmailTransporter();
    await transporter.sendMail({
      from: invoiceEmailFrom(),
      to: recipient,
      subject: `Payment receipt: invoice #${invoiceNumber}`,
      messageId: `<invoice-payment-${payment.id}@${new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost').hostname}>`,
      html: receiptHtml,
      text: `Hello ${invoice.customer?.name || 'Customer'},\n\nWe received your payment of ${formatMoney(payment.amount)} for invoice #${invoiceNumber}.\nPayment date: ${payment.payment_date}\nReference: ${paymentReference}\nInvoice balance remaining: ${formatMoney(invoice.balanceRemaining)}\n\nThank you,\n${businessName}`,
    });
    const { error: updateError } = await supabase
      .from('invoice_email_logs')
      .update({ status: 'sent', sent_at: new Date().toISOString(), error: null })
      .eq('id', log.id);
    if (updateError) throw new Error(`Receipt was emailed but its history could not be updated: ${updateError.message}`);
    return { sent: true, alreadySent: false };
  } catch (error) {
    const { error: updateError } = await supabase
      .from('invoice_email_logs')
      .update({ status: 'failed', error: error.message || 'Receipt email failed.' })
      .eq('id', log.id);
    if (updateError) {
      console.error(`Failed to save receipt email result for payment ${payment.id}:`, updateError.message);
    }
    throw error;
  }
}
