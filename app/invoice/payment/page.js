import VerifyInvoicePayment from '../../../components/VerifyInvoicePayment';

export default function InvoicePaymentResultPage({ searchParams }) {
  return (
    <main className="mx-auto mt-12 max-w-xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <h1 className="mb-3 text-2xl font-bold text-slate-900">Payment status</h1>
      <VerifyInvoicePayment
        token={searchParams.token || ''}
        reference={searchParams.reference || searchParams.trxref || ''}
      />
    </main>
  );
}
