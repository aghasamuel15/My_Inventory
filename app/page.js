import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#f6f6f1] text-[#17251f]">
      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-8 sm:py-6">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#12392e] text-[#d9bd8c] shadow-lg shadow-[#12392e]/15">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-5 w-5" aria-hidden="true">
              <path d="M4 18.5 8.5 8l3.5 8 3.5-6 4.5 8.5" /><path d="M3 21h18" />
            </svg>
          </span>
          <span className="text-base font-bold tracking-[-0.03em] text-[#19372b] sm:text-lg">SME Tracker</span>
        </Link>
        <nav className="flex shrink-0 items-center gap-2 sm:gap-3">
          <Link href="/login" className="rounded-full px-4 py-2 text-sm font-semibold text-[#40574b] transition hover:bg-white">
            Log in
          </Link>
          <Link href="/signup" className="rounded-full bg-[#12392e] px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-[#12392e]/15 transition hover:-translate-y-0.5 hover:bg-[#1a4b3b]">
            Get started
          </Link>
        </nav>
      </header>

      <section className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 pb-14 pt-10 sm:px-8 sm:pb-20 sm:pt-16 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="relative z-10">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#dce6dc] bg-white/80 px-3.5 py-2 text-[10px] font-bold uppercase tracking-[0.15em] text-[#537360] shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-[#b99256]" />
            Built for Nigerian SMEs
          </span>
          <h1 className="mt-7 max-w-3xl text-[2.6rem] font-semibold leading-[1.04] tracking-[-0.065em] text-[#18372b] sm:text-5xl md:text-[4.25rem]">
            Your business, with <span className="text-[#8b7145]">clarity</span> and control.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-[#65736a] sm:text-lg sm:leading-8">
            Bring sales, stock, expenses, customers and invoices together in one considered workspace. Spend less time searching and more time growing.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/signup" className="rounded-full bg-[#12392e] px-6 py-3.5 text-center text-sm font-semibold text-white shadow-lg shadow-[#12392e]/15 transition hover:-translate-y-0.5 hover:bg-[#1a4b3b]">
              Create free account
            </Link>
            <Link href="/login" className="rounded-full border border-[#dbe3da] bg-white/80 px-6 py-3.5 text-center text-sm font-semibold text-[#40574b] transition hover:border-[#afc1b2] hover:bg-white">
              Sign in
            </Link>
          </div>

          <div className="mt-8 flex items-center gap-2 text-xs text-[#78847c]">
            <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 text-[#718b75]" aria-hidden="true"><path d="m5 10 3.2 3.2L15.5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Simple tools for running a business with confidence
          </div>
        </div>

        <div className="relative">
          <div className="absolute -inset-8 rounded-[40px] bg-[#dfe8df]/70 blur-2xl" />
          <div className="relative overflow-hidden rounded-[30px] border border-[#e1e8df] bg-white p-4 shadow-[0_28px_80px_rgba(27,56,41,0.12)] sm:p-6">
            <div className="rounded-[23px] bg-[#12392e] p-5 text-white sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-[#d5c293]">Weekly summary</p>
                  <div className="mt-3 text-sm text-white/65">Revenue this week</div>
                  <div className="mt-1 text-3xl font-semibold tracking-[-0.055em]">₦182,400</div>
                </div>
                <span className="rounded-full border border-white/10 bg-white/[0.08] px-3 py-1.5 text-[10px] text-white/75">This week</span>
              </div>
              <div className="mt-6 flex h-20 items-end gap-2 border-b border-white/10 pb-0">
                {[38, 55, 45, 70, 58, 84, 100].map((height, index) => (
                  <div key={index} className="flex-1 rounded-t-md bg-gradient-to-t from-[#67927a] to-[#c3d1a5]" style={{ height: `${height}%`, opacity: 0.48 + index * 0.07 }} />
                ))}
              </div>
              <div className="mt-2 flex justify-between text-[9px] text-white/45"><span>MON</span><span>TUE</span><span>WED</span><span>THU</span><span>FRI</span><span>SAT</span><span>SUN</span></div>
            </div>
            <div className="grid gap-3 p-1 pt-4 sm:grid-cols-2 sm:gap-4 sm:p-2 sm:pt-5">
              <div className="rounded-2xl border border-[#e8ece6] bg-[#fbfcfa] p-4">
                <div className="flex items-center gap-2 text-xs text-[#78847c]"><span className="h-2 w-2 rounded-full bg-[#bc995f]" />Expenses</div>
                <div className="mt-2 text-xl font-semibold tracking-[-0.04em] text-[#263b30]">₦68,200</div>
              </div>
              <div className="rounded-2xl border border-[#e8ece6] bg-[#fbfcfa] p-4">
                <div className="flex items-center gap-2 text-xs text-[#78847c]"><span className="h-2 w-2 rounded-full bg-[#43856c]" />Profit</div>
                <div className="mt-2 text-xl font-semibold tracking-[-0.04em] text-[#176b52]">₦114,200</div>
              </div>
            </div>
            <div className="mx-1 mb-1 flex items-center justify-between gap-3 rounded-2xl border border-[#e8ece6] bg-[#fbfcfa] p-4 sm:mx-2 sm:mb-2">
              <div><div className="text-xs text-[#78847c]">Outstanding invoices</div><div className="mt-1 text-xl font-semibold tracking-[-0.04em] text-[#263b30]">₦74,500</div></div>
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f7f1e7] text-[#98743c]">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-5 w-5" aria-hidden="true"><path d="M6 3.5h8l4 4V20l-2-1.2L14 20l-2-1.2L10 20l-2-1.2L6 20z" /><path d="M14 3.5V8h4M9 12h6M9 16h6" /></svg>
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#927b56]">Everything in one place</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.045em] text-[#20372c]">A better rhythm for business</h2></div>
          <p className="max-w-md text-sm leading-6 text-[#738078]">Thoughtful essentials to help you keep work clear, connected and moving forward.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            ['Record sales & expenses', 'Capture every payment and outgoing cost in seconds.', '01'],
            ['Track debtors', 'Know exactly which customers owe you and how much.', '02'],
            ['Generate invoices', 'Create polished invoices and push them to payment.', '03'],
          ].map(([title, desc, number]) => (
            <div key={title} className="rounded-[22px] border border-[#e3e9e2] bg-white p-5 shadow-[0_8px_24px_rgba(31,51,41,0.04)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_32px_rgba(31,51,41,0.08)] sm:p-6">
              <span className="text-[10px] font-bold tracking-[0.15em] text-[#b99256]">{number}</span>
              <h3 className="mt-4 text-base font-semibold tracking-[-0.02em] text-[#263b30]">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-[#738078]">{desc}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
