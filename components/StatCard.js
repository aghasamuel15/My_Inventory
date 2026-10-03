export default function StatCard({ label, value, tone = 'brand' }) {
  const colorMap = {
    brand: 'bg-brand-50 text-brand-700',
    red: 'bg-red-50 text-red-700',
    amber: 'bg-amber-50 text-amber-700',
    emerald: 'bg-emerald-50 text-emerald-700',
  };

  return (
    <div className="card">
      <div className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${colorMap[tone]}`}>{label}</div>
      <div className="mt-4 text-2xl font-black text-slate-900">{value}</div>
    </div>
  );
}
