import { redirect } from 'next/navigation';
import Sidebar from '../../components/Sidebar';
import BusinessFeatureGate from '../../components/BusinessFeatureGate';
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
    <div className="flex min-h-screen flex-col bg-[#f5f5f0] md:flex-row">
      <Sidebar />
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 border-b border-[#e5e9e3]/90 bg-[#fbfcf9]/90 px-4 py-3 backdrop-blur-xl print:hidden sm:px-8 sm:py-4">
          <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#87938b]">Business workspace</p>
              <span className="block truncate text-[15px] font-semibold tracking-[-0.02em] text-[#20372c] sm:text-base">{businessName}</span>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-[#e4e9e2] bg-white px-3 py-1.5 text-[10px] font-semibold text-[#66766c] shadow-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-[#4c9870]" />
              Private workspace
            </div>
          </div>
        </header>
        <main className="min-w-0 px-4 py-6 pb-28 sm:px-8 sm:py-8 sm:pb-28 md:pb-10">
          <div className="mx-auto max-w-[1500px]">
            <BusinessFeatureGate>{children}</BusinessFeatureGate>
          </div>
        </main>
      </div>
    </div>
  );
}
