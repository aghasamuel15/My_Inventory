'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '../lib/supabaseClient';
import dashboardNavigation from '../lib/dashboardNavigation';
import useBusinessFeatures from '../lib/useBusinessFeatures';

const NavIcon = ({ children, className = '' }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`h-4 w-4 ${className}`} aria-hidden="true">
    {children}
  </svg>
);

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const features = useBusinessFeatures();
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

  const isActiveLink = (href) => pathname === href || (
    href !== '/dashboard'
    && pathname.startsWith(`${href}/`)
    && !dashboardNavigation.some((link) => link.href.length > href.length && (
      pathname === link.href || pathname.startsWith(`${link.href}/`)
    ))
  );
  const iconFor = (label) => {
    const icons = {
      Overview: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /></>,
      Sales: <><path d="M4 19V5" /><path d="M4 19h17" /><path d="m7 15 4-4 3 2 6-7" /><path d="M16 6h4v4" /></>,
      Stock: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="M3 8v8l9 5 9-5V8" /><path d="M12 13v8" /></>,
      Expenses: <><path d="M4 5h16v14H4z" /><path d="M4 9h16" /><path d="M8 15h3" /><path d="M16 15h.01" /></>,
      Cashbook: <><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H20v16H6.5A2.5 2.5 0 0 1 4 17.5z" /><path d="M4 7h16" /><path d="M15 13h5" /></>,
      'Cash runway': <><path d="M3 18h18" /><path d="M5 15V9" /><path d="M10 15V5" /><path d="M15 15v-3" /><path d="M20 15V7" /></>,
      Customers: <><path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20" /><circle cx="10" cy="8" r="3.5" /><path d="M16 4.5a3.5 3.5 0 0 1 0 6.8M20 20v-1.5a3.5 3.5 0 0 0-2.5-3.35" /></>,
      Invoices: <><path d="M6 3.5h8l4 4V20l-2-1.2L14 20l-2-1.2L10 20l-2-1.2L6 20z" /><path d="M14 3.5V8h4M9 12h6M9 16h6" /></>,
      'Recurring invoices': <><path d="M20 7v5h-5" /><path d="M4 17v-5h5" /><path d="M5.5 9a7 7 0 0 1 11.6-2L20 12M4 12l2.9 5a7 7 0 0 0 11.6-2" /></>,
      Accounting: <><path d="M4 5h16v14H4z" /><path d="M8 9h8M8 13h3M8 16h8" /></>,
      Reports: <><path d="M4 19V5" /><path d="M4 19h17" /><path d="M8 16v-4M13 16V8M18 16v-7" /></>,
      Settings: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.7a7.8 7.8 0 0 1-1.8 1l-.3 1.8h-2.8l-.3-1.8a7.8 7.8 0 0 1-1.8-1l-1.7.7-1.4-2.4L7.1 15a7.6 7.6 0 0 1 0-2l-.1-.1-1.4-1.1L7 9.4l1.7.7a7.8 7.8 0 0 1 1.8-1l.3-1.8h2.8l.3 1.8a7.8 7.8 0 0 1 1.8 1l1.7-.7 1.4 2.4-1.4 1.1a7.6 7.6 0 0 1 0 2Z" /></>,
    };
    return <NavIcon>{icons[label] || <circle cx="12" cy="12" r="8" />}</NavIcon>;
  };

  return (
    <>
      <aside className="relative z-40 w-full shrink-0 overflow-hidden border-b border-[#25483d] bg-[#102e25] text-white print:hidden md:sticky md:top-0 md:flex md:h-screen md:min-h-0 md:w-[264px] md:flex-col md:border-b-0 md:border-r">
        <div className="pointer-events-none absolute -right-24 -top-20 hidden h-64 w-64 rounded-full border border-white/[0.06] md:block" />
        <div className="pointer-events-none absolute -right-12 -top-8 hidden h-40 w-40 rounded-full border border-white/[0.06] md:block" />
        <div className="relative flex items-center justify-between border-b border-white/10 px-4 py-3.5 md:px-6 md:py-6">
          <Link href="/dashboard" className="group flex items-center gap-3" aria-label="SME Tracker home">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#d1b27b]/40 bg-white/[0.06] text-[#d9bd8c] shadow-inner">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-5 w-5" aria-hidden="true">
                <path d="M4 18.5 8.5 8l3.5 8 3.5-6 4.5 8.5" />
                <path d="M3 21h18" />
              </svg>
            </span>
            <span>
              <span className="block text-[15px] font-bold tracking-[0.01em] text-white">SME Tracker</span>
              <span className="hidden text-[9px] font-semibold uppercase tracking-[0.22em] text-[#c5b790] md:block">Business suite</span>
            </span>
          </Link>
          <span className="hidden rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/55 md:inline-flex">Workspace</span>
        </div>
        <nav id="dashboard-navigation" aria-label="Main navigation" className="relative hidden min-h-0 space-y-1 overflow-y-auto overscroll-contain px-3 py-5 pb-8 md:block md:flex-1">
          <p className="mb-3 px-3 text-[9px] font-bold uppercase tracking-[0.2em] text-white/40">Workspace</p>
          {dashboardNavigation.filter((link) => !link.feature || features === null || features === undefined || features.includes(link.feature)).map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isActiveLink(link.href) ? 'page' : undefined}
              className={`group relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-[12px] font-medium transition-colors ${
                isActiveLink(link.href)
                  ? 'bg-[#21483c] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.07)]'
                  : 'text-[#c0cdc6] hover:bg-white/[0.06] hover:text-white'
              }`}
            >
              {isActiveLink(link.href) && <span className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-[#d1b27b]" />}
              <span className={isActiveLink(link.href) ? 'text-[#d9bd8c]' : 'text-white/45 group-hover:text-white/80'}>{iconFor(link.label)}</span>
              <span className="truncate">{link.label}</span>
            </Link>
          ))}
          <div className="mt-6 border-t border-white/10 pt-4">
            <button onClick={handleLogout} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-xs font-medium text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white">
              <NavIcon><path d="M10 17l5-5-5-5M15 12H3" /><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></NavIcon>
              Log out
            </button>
          </div>
        </nav>
        <div className="relative hidden shrink-0 border-t border-white/10 bg-[#102e25] px-6 py-4 md:block">
          <div className="flex items-center gap-2 text-[10px] text-white/45">
            <span className="h-1.5 w-1.5 rounded-full bg-[#9bc5a8]" />
            Your business, in good order
          </div>
        </div>
      </aside>
      <nav aria-label="Quick navigation" className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t border-[#e1e7e1] bg-white/95 px-2 pt-2 shadow-[0_-8px_24px_rgba(19,47,37,0.08)] backdrop-blur-xl md:hidden print:hidden" style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
        {mobileLinks.filter((link) => {
          const feature = link.href === '/dashboard/sales' ? 'sales'
            : link.href === '/dashboard/inventory' ? 'inventory'
              : link.href === '/dashboard/invoices' ? 'invoices' : null;
          return !feature || features === null || features === undefined || features.includes(feature);
        }).map((link) => (
          <Link
            key={link.href}
            href={link.href}
            aria-current={pathname === link.href ? 'page' : undefined}
            className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-semibold ${
              isActiveLink(link.href) ? 'text-brand-700' : 'text-slate-500'
            }`}
          >
            <span className="flex h-4 w-4 items-center justify-center">{link.icon}</span>
            {link.label}
          </Link>
        ))}
        <Link
          href="/dashboard/more"
          aria-current={pathname === '/dashboard/more' ? 'page' : undefined}
          className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-semibold ${pathname === '/dashboard/more' ? 'text-brand-700' : 'text-slate-500'}`}
        >
          <span className="flex h-4 w-4 items-center justify-center">
            <NavIcon>
              <path d="M4 7h16M4 12h16M4 17h16" />
            </NavIcon>
          </span>
          More
        </Link>
      </nav>
    </>
  );
}
