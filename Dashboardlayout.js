import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "../../lib/supabaseServer";
import Sidebar from "../../components/Sidebar";

export default async function DashboardLayout({ children }) {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="flex">
      <Sidebar />
      <div className="flex-1 min-h-screen">
        <header className="bg-white border-b px-6 py-3 flex justify-between items-center">
          <span className="font-medium text-gray-700">My Business</span>
          <span className="text-xs bg-brand-50 text-brand-700 px-2 py-1 rounded-full">Testing access</span>
        </header>
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}