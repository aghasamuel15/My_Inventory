'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '../lib/supabaseClient';

const NavIcon = ({ children, className = '' }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`h-4 w-4 ${className}`} aria-hidden="true">
    {children}
  </svg>
);

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
    { href: '/dashboard', label: 'Home', icon: <NavIcon><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20h14V9.5" /></NavIcon> },
    { href: '/dashboard/sales', label: 'Sales', icon: <NavIcon><path d="M4 18V8.5A1.5 1.5 0 0 1 5.5 7H18a2 2 0 0 1 2 2v9" /><path d="M4 15h16" /><path d="M7 12h3" /><path d="M7 7V5.5A1.5 1.5 0 0 1 8.5 4h7A1.5 1.5 0 0 1 17 5.5V7" /></NavIcon> },
    { href: '/dashboard/inventory', label: 'Stock', icon: <NavIcon><path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Z" /><path d="M12 12v9" /><path d="M4 7.5l8 4.5 8-4.5" /></NavIcon> },
    { href: '/dashboard/invoices', label: 'Invoices', icon: <NavIcon><path d="M7 3.5h8l4 4V18a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5.5a2 2 0 0 1 2-2Z" /><path d="M15 3.5V8h4" /><path d="M8 12h8M8 16h8" /></NavIcon> },
  ];

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  const isActiveLink = (href) => pathname === href || (href !== '/dashboard' && pathname.startsWith(`${href}/`));

  return (
    <>
      <aside className="w-full shrink-0 border-b border-slate-200 bg-white print:hidden md:min-h-screen md:w-64 md:border-b-0 md:border-r">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4 md:px-5 md:py-5">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="btn-secondary px-3 py-2 text-sm md:hidden"
              aria-expanded={menuOpen}
              aria-controls="dashboard-navigation"
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? 'Close' : 'Menu'}
            </button>
            <span className="text-xl font-black text-brand-700">SME Tracker</span>
          </div>
        </div>
        <nav id="dashboard-navigation" className={`${menuOpen ? 'block max-h-[calc(100dvh-11rem)] overflow-y-auto border-t border-slate-100 px-3 py-3' : 'hidden'} space-y-1 md:block md:max-h-none md:overflow-visible md:border-0 md:py-4`}>
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
            className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-semibold ${
              isActiveLink(link.href) ? 'text-brand-700' : 'text-slate-500'
            }`}
          >
            <span className="flex h-4 w-4 items-center justify-center">{link.icon}</span>
            {link.label}
          </Link>
        ))}
        <button
          type="button"
          aria-expanded={menuOpen}
          aria-controls="dashboard-navigation"
          onClick={() => setMenuOpen((open) => !open)}
          className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-semibold ${menuOpen ? 'text-brand-700' : 'text-slate-500'}`}
        >
          <span className="flex h-4 w-4 items-center justify-center">
            <NavIcon>
              <path d="M4 7h16M4 12h16M4 17h16" />
            </NavIcon>
          </span>
          More
        </button>
      </nav>
    </>
  );
}
