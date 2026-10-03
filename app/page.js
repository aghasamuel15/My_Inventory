import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="text-xl font-bold text-brand-700">SME Tracker</div>
        <nav className="flex items-center gap-3">
          <Link href="/login" className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-white">
            Log in
          </Link>
          <Link href="/signup" className="rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
            Get started
          </Link>
        </nav>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-8 px-6 py-16 lg:grid-cols-2">
        <div>
          <span className="inline-flex rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-brand-700">
            Built for Nigerian SMEs
          </span>
          <h1 className="mt-6 text-4xl font-black leading-tight text-slate-900 md:text-6xl">
            Track sales, expenses, debt and invoices in one place.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-slate-600">
            Keep your business finances clean, spot your profit faster, and send invoices that customers can pay quickly.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/signup" className="rounded-full bg-brand-600 px-5 py-3 font-semibold text-white hover:bg-brand-700">
              Create free account
            </Link>
            <Link href="/login" className="rounded-full border border-slate-300 bg-white px-5 py-3 font-semibold text-slate-700 hover:bg-slate-100">
              Sign in
            </Link>
          </div>

          <div className="mt-8 text-sm text-slate-600">
            Access fee: <span className="font-bold text-brand-700">₦5,000</span> to unlock the dashboard.
          </div>
        </div>

        <div className="rounded-3xl bg-white p-6 shadow-lg ring-1 ring-slate-200">
          <div className="grid gap-4">
            <div className="rounded-2xl bg-brand-50 p-4">
              <div className="text-sm text-slate-500">Revenue this week</div>
              <div className="mt-2 text-3xl font-bold text-brand-700">₦182,400</div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="text-sm text-slate-500">Expenses</div>
                <div className="mt-2 text-2xl font-bold text-slate-800">₦68,200</div>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="text-sm text-slate-500">Profit</div>
                <div className="mt-2 text-2xl font-bold text-emerald-600">₦114,200</div>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="text-sm text-slate-500">Customers owing</div>
              <div className="mt-2 text-2xl font-bold text-amber-600">₦74,500</div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-20">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            ['Record sales & expenses', 'Capture every payment and outgoing cost in seconds.'],
            ['Track debtors', 'Know exactly which customers owe you and how much.'],
            ['Generate invoices', 'Create polished invoices and push them to payment.'],
          ].map(([title, desc]) => (
            <div key={title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
              <p className="mt-2 text-sm text-slate-600">{desc}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
