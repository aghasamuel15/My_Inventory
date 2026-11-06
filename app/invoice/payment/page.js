import VerifyInvoicePayment from '../../../components/VerifyInvoicePayment';

export default function InvoicePaymentResultPage({ searchParams }) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f5f5f0] px-4 py-8 sm:px-6 sm:py-14">
      <div className="pointer-events-none absolute -left-36 -top-32 h-[28rem] w-[28rem] rounded-full bg-[#dfe8df]/70 blur-3xl" />
      <div className="relative w-full max-w-xl">
        <div className="mb-5 flex items-center justify-center gap-2 text-sm font-bold tracking-[-0.02em] text-[#315d48]">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#12392e] text-[#d9bd8c]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4" aria-hidden="true"><path d="M4 18.5 8.5 8l3.5 8 3.5-6 4.5 8.5M3 21h18" /></svg>
          </span>
          SME Tracker
        </div>
        <VerifyInvoicePayment
          token={searchParams.token || ''}
          reference={searchParams.reference || searchParams.trxref || ''}
        />
      </div>
    </main>
  );
}
