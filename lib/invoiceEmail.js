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

export function invoiceEmailFrom() {
  return process.env.EMAIL_FROM || process.env.EMAIL_SMTP_USER;
}
