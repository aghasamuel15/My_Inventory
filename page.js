import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col">
      <header className="flex justify-between items-center px-6 py-4 border-b bg-white">
        <span className="font-bold text-lg text-brand-700">SME Tracker</span>
        <div className="flex gap-3">
          <Link href="/login" className="btn-secondary">Log in</Link>
          <Link href="/signup" className="btn-primary">Get started</Link>
        </div>
      </header>

      <section className="flex-1 flex flex-col items-center justify-center text-center px-6 py-20">
        <h1 className="text-4xl font-bold max-w-2xl">
          Track sales, expenses and invoices — built for Nigerian small businesses
        </h1>
        <p className="text-gray-600 mt-4 max-w-xl">
          Record sales, log expenses, keep tabs on customers who owe you, generate
          professional invoices, and see your profit daily or weekly.
        </p>
        <div className="mt-8 flex gap-4">
          <Link href="/signup" className="btn-primary">Create free account</Link>
        </div>
        <div className="mt-6 text-sm text-gray-500">
          One-time access fee: <span className="font-semibold">₦5,000</span> to unlock all features
        </div>
      </section>

      <section className="grid sm:grid-cols-3 gap-6 px-6 pb-20 max-w-4xl mx-auto">
        {[
          ["Record sales & expenses", "Log every transaction in seconds."],
          ["Track customer debt", "Know exactly who owes you and how much."],
          ["Generate invoices", "Create and share professional invoices instantly."],
        ].map(([title, desc]) => (
          <div key={title} className="card text-left">
            <h3 className="font-semibold mb-1">{title}</h3>
            <p className="text-sm text-gray-600">{desc}</p>
          </div>
        ))}
      </section>
    </main>
  );
}