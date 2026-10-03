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

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('business_name')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    console.error('Could not load business profile:', profileError.message);
  }

  const businessName = profile?.business_name?.trim() || 'My Business';

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 md:flex-row">
      <Sidebar />
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur print:hidden sm:px-6 sm:py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-lg font-semibold text-slate-800">{businessName}</span>
          </div>
        </header>
        <main className="min-w-0 px-4 py-5 pb-24 sm:p-6 md:pb-6">{children}</main>
      </div>
    </div>
  );
}
