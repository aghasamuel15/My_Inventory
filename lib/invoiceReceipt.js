import {
  createInvoiceEmailTransporter,
  invoiceEmailErrorMessage,
  invoiceEmailFrom,
} from './invoiceEmail';

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
  const customerName = invoice.customer?.name || 'Customer';
  const paymentDate = payment.payment_date || '—';
  const receiptHtml = `
    <!doctype html>
    <html lang="en">
      <body style="margin:0;padding:0;background-color:#f5f5f0;font-family:Arial,Helvetica,sans-serif;color:#20372c;">
        <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Payment received: ${formatMoney(payment.amount)} for invoice #${escapeHtml(invoiceNumber)}.</div>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f5f5f0;">
          <tr><td align="center" style="padding:32px 14px;">
            <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border:1px solid #e1e8df;border-radius:20px;overflow:hidden;">
              <tr><td style="padding:30px 34px 28px;background-color:#12392e;background-image:linear-gradient(135deg,#163c30,#0d2b22);">
                <p style="margin:0;color:#d5c293;font-size:11px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;">${escapeHtml(businessName)}</p>
                <h1 style="margin:18px 0 7px;color:#ffffff;font-size:25px;line-height:1.25;font-weight:bold;">Payment received</h1>
                <p style="margin:0;color:#d7e1da;font-size:14px;line-height:1.6;">Your payment for invoice <strong style="color:#ffffff;">#${escapeHtml(invoiceNumber)}</strong> has been recorded.</p>
              </td></tr>
              <tr><td style="padding:28px 34px 12px;">
                <p style="margin:0 0 18px;color:#506359;font-size:14px;">Hello ${escapeHtml(customerName)},</p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #e5ebe4;border-radius:14px;background-color:#fbfcfa;">
                  <tr><td align="center" style="padding:20px 16px 21px;">
                    <p style="margin:0 0 7px;color:#738078;font-size:10px;font-weight:bold;letter-spacing:1.5px;text-transform:uppercase;">Amount received</p>
                    <p style="margin:0;color:#176b52;font-size:30px;line-height:1.2;font-weight:bold;letter-spacing:-1px;">${formatMoney(payment.amount)}</p>
                  </td></tr>
                </table>
              </td></tr>
              <tr><td style="padding:12px 34px 8px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr><td style="padding:11px 0;border-bottom:1px solid #edf0eb;color:#738078;font-size:13px;">Invoice number</td><td align="right" style="padding:11px 0;border-bottom:1px solid #edf0eb;color:#2c4035;font-size:13px;font-weight:bold;">#${escapeHtml(invoiceNumber)}</td></tr>
                  <tr><td style="padding:11px 0;border-bottom:1px solid #edf0eb;color:#738078;font-size:13px;">Payment date</td><td align="right" style="padding:11px 0;border-bottom:1px solid #edf0eb;color:#2c4035;font-size:13px;">${escapeHtml(paymentDate)}</td></tr>
                  <tr><td style="padding:11px 0;border-bottom:1px solid #edf0eb;color:#738078;font-size:13px;">Reference</td><td align="right" style="padding:11px 0;border-bottom:1px solid #edf0eb;color:#2c4035;font-size:13px;word-break:break-word;">${escapeHtml(paymentReference)}</td></tr>
                </table>
              </td></tr>
              <tr><td style="padding:14px 34px 28px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-radius:12px;background-color:#f1f7f1;">
                  <tr><td style="padding:15px 16px;color:#315d48;font-size:13px;font-weight:bold;">Remaining invoice balance</td><td align="right" style="padding:15px 16px;color:#176b52;font-size:16px;font-weight:bold;">${formatMoney(invoice.balanceRemaining)}</td></tr>
                </table>
                <p style="margin:24px 0 0;color:#506359;font-size:14px;line-height:1.7;">Thank you for your payment. We appreciate your business.</p>
                <p style="margin:10px 0 0;color:#20372c;font-size:14px;font-weight:bold;">${escapeHtml(businessName)}</p>
              </td></tr>
              <tr><td style="padding:16px 34px;border-top:1px solid #edf0eb;background-color:#fbfcfa;color:#87938b;font-size:11px;line-height:1.6;">This email confirms a payment recorded against your invoice. Please keep it for your records.</td></tr>
            </table>
          </td></tr>
        </table>
      </body>
    </html>
  `;

  try {
    const transporter = createInvoiceEmailTransporter();
    const delivery = await transporter.sendMail({
      from: invoiceEmailFrom(),
      to: recipient,
      subject: `Payment receipt: invoice #${invoiceNumber}`,
      html: receiptHtml,
      text: `PAYMENT RECEIPT\n${businessName}\n\nHello ${customerName},\n\nWe received your payment of ${formatMoney(payment.amount)} for invoice #${invoiceNumber}.\nPayment date: ${paymentDate}\nReference: ${paymentReference}\nRemaining invoice balance: ${formatMoney(invoice.balanceRemaining)}\n\nThank you for your payment.\n${businessName}`,
    });
    const recipientAccepted = delivery.accepted?.some((address) => {
      const acceptedAddress = typeof address === 'string' ? address : address?.address;
      return acceptedAddress?.trim().toLowerCase() === recipient.trim().toLowerCase();
    });
    if (!recipientAccepted) {
      throw new Error('The email server did not accept the customer address. Check the email address and SMTP delivery settings.');
    }

    const { error: updateError } = await supabase
      .from('invoice_email_logs')
      .update({ status: 'sent', sent_at: new Date().toISOString(), error: null })
      .eq('id', log.id);
    if (updateError) throw new Error(`Receipt was emailed but its history could not be updated: ${updateError.message}`);
    return { sent: true, alreadySent: false };
  } catch (error) {
    const { error: updateError } = await supabase
      .from('invoice_email_logs')
      .update({ status: 'failed', error: invoiceEmailErrorMessage(error) })
      .eq('id', log.id);
    if (updateError) {
      console.error(`Failed to save receipt email result for payment ${payment.id}:`, updateError.message);
    }
    throw new Error(invoiceEmailErrorMessage(error), { cause: error });
  }
}
