'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabaseClient';
import dashboardNavigation from '../../../lib/dashboardNavigation';

export default function MorePage() {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      window.alert(`Could not log out: ${error.message}`);
      return;
    }
    router.push('/login');
    router.refresh();
  }

  return (
    <section>
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Navigation</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">All features</h1>
        <p className="mt-1 text-sm text-slate-600">Choose a section to open.</p>
      </div>

      <nav aria-label="All features" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {dashboardNavigation.filter((item) => item.href !== '/dashboard').map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
          >
            <span className="flex items-center justify-between gap-3">
              <span className="font-bold text-slate-900 group-hover:text-brand-700">{item.label}</span>
              <span aria-hidden="true" className="text-lg text-slate-400 group-hover:text-brand-700">›</span>
            </span>
            <span className="mt-1 block text-sm text-slate-600">{item.description}</span>
          </Link>
        ))}
      </nav>

      <div className="mt-6 border-t border-slate-200 pt-5 md:hidden">
        <button type="button" onClick={handleLogout} className="btn-secondary w-full">
          Log out
        </button>
      </div>
    </section>
  );
}
