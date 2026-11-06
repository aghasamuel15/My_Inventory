'use client';

import { usePathname } from 'next/navigation';
import useBusinessFeatures from '../lib/useBusinessFeatures';

const featureRoutes = [
  ['/dashboard/sales', 'sales'],
  ['/dashboard/inventory', 'inventory'],
  ['/dashboard/expenses', 'expenses'],
  ['/dashboard/customers', 'customers'],
  ['/dashboard/invoices', 'invoices'],
  ['/dashboard/reports', 'reports'],
];

export default function BusinessFeatureGate({ children }) {
  const pathname = usePathname();
  const features = useBusinessFeatures();
  const requiredFeature = featureRoutes.find(([prefix]) => (
    pathname === prefix || pathname.startsWith(`${prefix}/`)
  ))?.[1];

  if (!requiredFeature || features === null) return children;
  if (features === undefined) {
    return <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">Checking section access...</p>;
  }
  if (features.includes(requiredFeature)) return children;

  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
      <h1 className="text-lg font-semibold text-amber-950">Section not available</h1>
      <p className="mt-1 text-sm text-amber-900">Your business Admin has not enabled this section for your role.</p>
    </section>
  );
}
