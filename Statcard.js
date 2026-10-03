export default function StatCard({ label, value, tone = "default" }) {
  const toneClass =
    tone === "positive"
      ? "text-brand-700"
      : tone === "negative"
      ? "text-red-600"
      : "text-gray-900";

  return (
    <div className="card">
      <div className="text-sm text-gray-500 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${toneClass}`}>{value}</div>
    </div>
  );
}