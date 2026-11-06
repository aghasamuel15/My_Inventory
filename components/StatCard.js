export default function StatCard({ label, value, tone = 'brand' }) {
  const colorMap = {
    brand: 'bg-[#eaf3ed] text-[#176b52]',
    red: 'bg-[#fbefed] text-[#a9483e]',
    amber: 'bg-[#f7f1e7] text-[#98743c]',
    emerald: 'bg-[#eaf3ed] text-[#176b52]',
  };
  const markerMap = {
    brand: 'bg-[#43856c]',
    red: 'bg-[#c66b60]',
    amber: 'bg-[#bc995f]',
    emerald: 'bg-[#43856c]',
  };

  return (
    <div className="group relative overflow-hidden rounded-[20px] border border-[#e3e9e3] bg-white p-5 shadow-[0_8px_24px_rgba(31,51,41,0.045)] transition duration-200 hover:-translate-y-0.5 hover:border-[#cbd9ce] hover:shadow-[0_14px_32px_rgba(31,51,41,0.08)] sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div className={`inline-flex max-w-full items-center gap-2 rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-[0.02em] ${colorMap[tone] || colorMap.brand}`}>
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${markerMap[tone] || markerMap.brand}`} />
          <span className="truncate">{label}</span>
        </div>
        <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#b3bdb5]">NGN</span>
      </div>
      <div className="mt-5 break-words text-[clamp(1.35rem,2.4vw,1.85rem)] font-bold leading-tight tracking-[-0.055em] text-[#1d3026]">{value}</div>
      <div className="pointer-events-none absolute -bottom-8 -right-7 h-20 w-20 rounded-full border border-[#edf1ec] transition-transform duration-300 group-hover:scale-125" />
    </div>
  );
}
