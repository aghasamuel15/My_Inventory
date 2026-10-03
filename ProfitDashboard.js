import { createServerSupabaseClient } from "../../lib/supabaseServer";
import StatCard from "../../components/StatCard";

function naira(n) {
  return `₦${Number(n || 0).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function startOfWeek() {
  const d = new Date();
  const day = d.getDay(); // 0 = Sunday
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday as start
  const monday = new Date(d.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().slice(0, 10);
}

export default async function DashboardOverview() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const today = startOfToday();
  const weekStart = startOfWeek();

  const [salesToday, expensesToday, salesWeek, expensesWeek, owingCustomers] = await Promise.all([
    supabase.from("sales").select("amount").eq("user_id", user.id).gte("sale_date", today),
    supabase.from("expenses").select("amount").eq("user_id", user.id).gte("expense_date", today),
    supabase.from("sales").select("amount").eq("user_id", user.id).gte("sale_date", weekStart),
    supabase.from("expenses").select("amount").eq("user_id", user.id).gte("expense_date", weekStart),
    supabase.from("invoices").select("total, status").eq("user_id", user.id).in("status", ["unpaid", "partial"]),
  ]);

  const sumOf = (rows) => (rows || []).reduce((acc, r) => acc + Number(r.amount), 0);

  const todaySales = sumOf(salesToday.data);
  const todayExpenses = sumOf(expensesToday.data);
  const weekSales = sumOf(salesWeek.data);
  const weekExpenses = sumOf(expensesWeek.data);
  const totalOwed = (owingCustomers.data || []).reduce((acc, r) => acc + Number(r.total), 0);

  return (
    <div>
      <h1 className="text-xl font-bold mb-6">Overview</h1>

      <h2 className="text-sm font-semibold text-gray-500 uppercase mb-2">Today</h2>
      <div className="grid sm:grid-cols-3 gap-4 mb-8">
        <StatCard label="Sales" value={naira(todaySales)} />
        <StatCard label="Expenses" value={naira(todayExpenses)} />
        <StatCard
          label="Profit"
          value={naira(todaySales - todayExpenses)}
          tone={todaySales - todayExpenses >= 0 ? "positive" : "negative"}
        />
      </div>

      <h2 className="text-sm font-semibold text-gray-500 uppercase mb-2">This week</h2>
      <div className="grid sm:grid-cols-3 gap-4 mb-8">
        <StatCard label="Sales" value={naira(weekSales)} />
        <StatCard label="Expenses" value={naira(weekExpenses)} />
        <StatCard
          label="Profit"
          value={naira(weekSales - weekExpenses)}
          tone={weekSales - weekExpenses >= 0 ? "positive" : "negative"}
        />
      </div>

      <h2 className="text-sm font-semibold text-gray-500 uppercase mb-2">Owed to you</h2>
      <div className="grid sm:grid-cols-3 gap-4">
        <StatCard label="Outstanding invoices" value={naira(totalOwed)} tone="negative" />
      </div>
    </div>
  );
}