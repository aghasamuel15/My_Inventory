export function getInvoicePaidTotal(invoice) {
  const paymentsTotal = (invoice.payments || []).reduce(
    (sum, payment) => sum + Number(payment.amount || 0),
    0
  );

  return invoice.status === 'paid'
    ? Math.max(paymentsTotal, Number(invoice.total || 0))
    : paymentsTotal;
}

export function getInvoiceBalance(invoice) {
  return Math.max(0, Number(invoice.total || 0) - getInvoicePaidTotal(invoice));
}
