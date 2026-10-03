import VerifyInvoicePayment from '../../../components/VerifyInvoicePayment';

export default function InvoicePaymentResultPage({ searchParams }) {
  return (
    <main className="mx-4 my-5 max-w-xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:mx-auto sm:mt-12 sm:p-8">
      <h1 className="mb-3 text-2xl font-bold text-slate-900">Payment status</h1>
      <VerifyInvoicePayment
        token={searchParams.token || ''}
        reference={searchParams.reference || searchParams.trxref || ''}
      />
    </main>
  );
}
