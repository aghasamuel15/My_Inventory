'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
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

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <aside className="w-64 shrink-0 border-r border-slate-200 bg-white print:hidden">
      <div className="border-b border-slate-200 px-5 py-5 text-xl font-black text-brand-700">SME Tracker</div>
      <nav className="space-y-1 px-3 py-4">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
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
      <div className="border-t border-slate-200 p-4">
        <button onClick={handleLogout} className="btn-secondary w-full">
          Log out
        </button>
      </div>
    </aside>
  );
}
