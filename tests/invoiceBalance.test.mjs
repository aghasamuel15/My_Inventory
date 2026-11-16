import assert from 'node:assert/strict';
import test from 'node:test';
import { getInvoiceBalance, getInvoicePaidTotal } from '../lib/invoiceBalance.js';

test('sums recorded invoice payments', () => {
  assert.equal(getInvoicePaidTotal({
    total: 100,
    status: 'sent',
    payments: [{ amount: '25' }, { amount: 15 }],
  }), 40);
});

test('treats a paid invoice as fully paid when payment records are missing', () => {
  const invoice = { total: 100, status: 'paid', payments: [] };
  assert.equal(getInvoicePaidTotal(invoice), 100);
  assert.equal(getInvoiceBalance(invoice), 0);
});

test('never returns a negative balance for overpayments', () => {
  assert.equal(getInvoiceBalance({
    total: 100,
    status: 'sent',
    payments: [{ amount: 125 }],
  }), 0);
});
