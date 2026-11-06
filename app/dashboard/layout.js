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

  const { data: membership, error: membershipError } = await supabase
    .from('business_memberships')
    .select('business_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();

  const { data: business, error: businessError } = membership?.business_id
    ? await supabase
      .from('businesses')
      .select('name')
      .eq('id', membership.business_id)
      .maybeSingle()
    : { data: null, error: null };

  if (membershipError || businessError) {
    console.error('Could not load business name:', membershipError?.message || businessError?.message);
  }

  const businessName = business?.name?.trim() || 'My Business';

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
