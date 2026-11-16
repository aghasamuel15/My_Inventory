import assert from 'node:assert/strict';
import test from 'node:test';
import { createInvoiceLinkToken, verifyInvoiceLinkToken } from '../lib/invoiceLink.js';

function withInvoiceSecrets(invoiceSecret, serviceRoleKey, run) {
  const originalInvoiceSecret = process.env.INVOICE_LINK_SECRET;
  const originalServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (invoiceSecret === undefined) delete process.env.INVOICE_LINK_SECRET;
  else process.env.INVOICE_LINK_SECRET = invoiceSecret;
  if (serviceRoleKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = serviceRoleKey;

  try {
    return run();
  } finally {
    if (originalInvoiceSecret === undefined) delete process.env.INVOICE_LINK_SECRET;
    else process.env.INVOICE_LINK_SECRET = originalInvoiceSecret;
    if (originalServiceRoleKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRoleKey;
  }
}

test('creates and verifies a signed invoice link token', () => {
  withInvoiceSecrets('test-only-secret', undefined, () => {
    const token = createInvoiceLinkToken('invoice-123');
    assert.equal(verifyInvoiceLinkToken(token), 'invoice-123');
  });
});

test('rejects modified invoice link tokens', () => {
  withInvoiceSecrets('test-only-secret', undefined, () => {
    const token = createInvoiceLinkToken('invoice-123');
    const [payload] = token.split('.');
    assert.equal(verifyInvoiceLinkToken(`${payload}.invalid-signature`), null);
  });
});

test('uses the service-role key as the fallback signing secret', () => {
  withInvoiceSecrets(undefined, 'service-role-test-secret', () => {
    const token = createInvoiceLinkToken('invoice-123');
    assert.equal(verifyInvoiceLinkToken(token), 'invoice-123');
  });
});

test('does not create or verify tokens without a signing secret', () => {
  withInvoiceSecrets(undefined, undefined, () => {
    assert.equal(createInvoiceLinkToken('invoice-123'), null);
    assert.equal(verifyInvoiceLinkToken('anything'), null);
  });
});
