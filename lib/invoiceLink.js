import { createHmac, timingSafeEqual } from 'node:crypto';

const LINK_TTL_SECONDS = 7 * 24 * 60 * 60;

function getSigningSecret() {
  return process.env.INVOICE_LINK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
}

export function createInvoiceLinkToken(invoiceId) {
  const secret = getSigningSecret();
  if (!secret) return null;

  const payload = Buffer.from(JSON.stringify({
    invoiceId,
    expiresAt: Math.floor(Date.now() / 1000) + LINK_TTL_SECONDS,
  })).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');

  return `${payload}.${signature}`;
}

export function verifyInvoiceLinkToken(token) {
  const secret = getSigningSecret();
  if (!secret || typeof token !== 'string') return null;

  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) return null;

  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (signatureBuffer.length !== expectedBuffer.length || !timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof decoded.invoiceId !== 'string' || decoded.expiresAt <= Math.floor(Date.now() / 1000)) {
      return null;
    }

    return decoded.invoiceId;
  } catch {
    return null;
  }
}