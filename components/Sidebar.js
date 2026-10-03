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

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <aside className="w-full shrink-0 border-b border-slate-200 bg-white print:hidden md:min-h-screen md:w-64 md:border-b-0 md:border-r">
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
      <nav id="dashboard-navigation" className={`${menuOpen ? 'block' : 'hidden'} space-y-1 px-3 py-3 md:block md:py-4`}>
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
      </nav>
      <div className={`${menuOpen ? 'block' : 'hidden'} border-t border-slate-200 p-4 md:block`}>
        <button onClick={handleLogout} className="btn-secondary w-full">
          Log out
        </button>
      </div>
    </aside>
  );
}
