"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "../lib/supabaseClient";

const links = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/sales", label: "Sales" },
  { href: "/dashboard/expenses", label: "Expenses" },
  { href: "/dashboard/customers", label: "Customers" },
  { href: "/dashboard/invoices", label: "Invoices" },
  { href: "/dashboard/reports", label: "Reports" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="w-56 shrink-0 bg-white border-r min-h-screen flex flex-col">
      <div className="px-5 py-4 font-bold text-brand-700 border-b">SME Tracker</div>
      <nav className="flex-1 py-4">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`block px-5 py-2 text-sm ${
              pathname === link.href
                ? "bg-brand-50 text-brand-700 font-medium border-r-2 border-brand-600"
                : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <button onClick={handleLogout} className="m-4 btn-secondary text-sm">
        Log out
      </button>
    </aside>
  );
}