import nodemailer from 'nodemailer';

export function createInvoiceEmailTransporter() {
  const { EMAIL_SMTP_HOST, EMAIL_SMTP_USER, EMAIL_SMTP_PASS } = process.env;

  if (!EMAIL_SMTP_HOST || !EMAIL_SMTP_USER || !EMAIL_SMTP_PASS) {
    throw new Error('Email delivery is not configured. Add EMAIL_SMTP_HOST, EMAIL_SMTP_USER, and EMAIL_SMTP_PASS.');
  }

  const port = Number(process.env.EMAIL_SMTP_PORT || 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('EMAIL_SMTP_PORT must be a valid port number.');
  }

  return nodemailer.createTransport({
    host: EMAIL_SMTP_HOST,
    port,
    secure: port === 465,
    auth: {
      user: EMAIL_SMTP_USER,
      pass: EMAIL_SMTP_PASS,
    },
  });
}

export function invoiceEmailErrorMessage(error) {
  const response = `${error?.response || ''} ${error?.message || ''}`;
  const authenticationRejected = Number(error?.responseCode) === 535
    || (error?.code === 'EAUTH' && /535(?:-| )/.test(response));

  if (authenticationRejected) {
    const isGmail = /gmail|google|gsmtp/i.test(`${process.env.EMAIL_SMTP_HOST || ''} ${response}`);
    return isGmail
      ? 'Gmail rejected the SMTP login. Set EMAIL_SMTP_USER to the full Gmail address and EMAIL_SMTP_PASS to a Google App Password created with 2-Step Verification enabled (not your regular password), then redeploy on Vercel.'
      : 'The SMTP server rejected the login. Check EMAIL_SMTP_USER and EMAIL_SMTP_PASS in Vercel, then redeploy.';
  }

  return error?.message || 'Email delivery failed.';
}

export function invoiceEmailFrom() {
  return process.env.EMAIL_FROM || process.env.EMAIL_SMTP_USER;
}
