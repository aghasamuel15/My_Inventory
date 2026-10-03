'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '../lib/supabaseClient';

const links = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/dashboard/sales', label: 'Sales' },
  { href: '/dashboard/inventory', label: 'Inventory' },
  { href: '/dashboard/expenses', label: 'Expenses' },
  { href: '/dashboard/customers', label: 'Customers' },
  { href: '/dashboard/invoices', label: 'Invoices' },
  { href: '/dashboard/invoices/recurring', label: 'Recurring invoices' },
  { href: '/dashboard/reports', label: 'Reports' },
  { href: '/dashboard/settings', label: 'Business profile' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const mobileLinks = [
    { href: '/dashboard', label: 'Home' },
    { href: '/dashboard/sales', label: 'Sales' },
    { href: '/dashboard/inventory', label: 'Stock' },
    { href: '/dashboard/invoices', label: 'Invoices' },
  ];

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <>
      <aside className="relative z-40 w-full shrink-0 border-b border-slate-200 bg-white print:hidden md:min-h-screen md:w-64 md:border-b-0 md:border-r">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4 md:px-5 md:py-5">
        <span className="text-xl font-black text-brand-700">SME Tracker</span>
        <button
          type="button"
          className="btn-secondary px-3 py-2 text-sm md:hidden"
          aria-expanded={menuOpen}
          aria-controls="dashboard-navigation"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? 'Close menu' : 'Menu'}
        </button>
      </div>
      <nav id="dashboard-navigation" className={`${menuOpen ? 'fixed inset-x-3 bottom-20 top-auto z-40 rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-xl' : 'hidden'} space-y-1 md:static md:block md:border-0 md:shadow-none md:py-4`}>
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            onClick={() => setMenuOpen(false)}
            className={`block rounded-xl px-4 py-2 text-sm font-medium ${
              pathname === link.href
                ? 'bg-brand-50 text-brand-700'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {link.label}
          </Link>
        ))}
        <div className="mt-3 border-t border-slate-200 pt-3 md:mt-4">
          <button onClick={handleLogout} className="btn-secondary w-full">
            Log out
          </button>
        </div>
      </nav>
      </aside>
      <nav aria-label="Quick navigation" className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t border-slate-200 bg-white/95 px-2 pt-2 shadow-[0_-4px_16px_rgba(15,23,42,0.06)] backdrop-blur md:hidden print:hidden" style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
        {mobileLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            onClick={() => setMenuOpen(false)}
            aria-current={pathname === link.href ? 'page' : undefined}
            className={`flex min-h-12 flex-col items-center justify-center rounded-xl px-1 text-[11px] font-semibold ${
              pathname === link.href || (link.href !== '/dashboard' && pathname.startsWith(`${link.href}/`))
                ? 'text-brand-700'
                : 'text-slate-500'
            }`}
          >
            <span className={`mb-1 h-1 w-5 rounded-full ${pathname === link.href || (link.href !== '/dashboard' && pathname.startsWith(`${link.href}/`)) ? 'bg-brand-600' : 'bg-transparent'}`} />
            {link.label}
          </Link>
        ))}
        <button
          type="button"
          aria-expanded={menuOpen}
          aria-controls="dashboard-navigation"
          onClick={() => setMenuOpen((open) => !open)}
          className={`flex min-h-12 flex-col items-center justify-center rounded-xl px-1 text-[11px] font-semibold ${menuOpen ? 'text-brand-700' : 'text-slate-500'}`}
        >
          <span className={`mb-1 h-1 w-5 rounded-full ${menuOpen ? 'bg-brand-600' : 'bg-transparent'}`} />
          More
        </button>
      </nav>
    </>
  );
}
