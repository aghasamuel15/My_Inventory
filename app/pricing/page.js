import Link from 'next/link';

export default function PricingPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl items-center justify-center px-6 py-16">
      <div className="w-full rounded-3xl border border-slate-200 bg-white p-8 shadow-lg">
        <div className="text-center">
          <div className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-700">Access</div>
          <h1 className="mt-3 text-4xl font-black text-slate-900">Unlock the full SME dashboard</h1>
          <p className="mt-4 text-slate-600">
            Pay a one-time access fee and start tracking your finances immediately.
          </p>
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
            <div className="text-sm text-slate-500">Single access fee</div>
            <div className="mt-3 text-4xl font-black text-brand-700">₦5,000</div>
            <ul className="mt-5 space-y-2 text-sm text-slate-600">
              <li>• Sales tracking</li>
              <li>• Expense logging</li>
              <li>• Customer debt management</li>
              <li>• Invoice generation</li>
              <li>• Daily and weekly profit insights</li>
              <li>• Export reports</li>
            </ul>
          </div>

          <div className="rounded-2xl border border-slate-200 p-6">
            <div className="text-lg font-semibold text-slate-800">Payment method</div>
            <p className="mt-2 text-sm text-slate-600">
              Use Paystack to complete your subscription. The frontend and API route are prepared for this flow.
            </p>
            <Link href="/signup" className="mt-6 inline-flex rounded-full bg-brand-600 px-5 py-3 font-semibold text-white hover:bg-brand-700">
              Continue signup
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
