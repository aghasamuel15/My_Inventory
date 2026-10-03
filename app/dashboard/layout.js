import { redirect } from 'next/navigation';
import Sidebar from '../../components/Sidebar';
import { createServerSupabaseClient } from '../../lib/supabaseServer';

export default async function DashboardLayout({ children }) {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />
      <div className="flex-1">
        <header className="border-b border-slate-200 bg-white px-6 py-4 print:hidden">
          <div className="flex items-center justify-between">
            <span className="text-lg font-semibold text-slate-800">My Business</span>
            <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-700">
              Testing access
            </span>
          </div>
        </header>
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
