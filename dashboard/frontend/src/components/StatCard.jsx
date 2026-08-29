export default function StatCard({ icon: Icon, label, value, accent = "violet" }) {
  const accents = {
    violet: "bg-violet-600/20 text-violet-300",
    green: "bg-emerald-600/20 text-emerald-300",
    amber: "bg-amber-600/20 text-amber-300",
    red: "bg-red-600/20 text-red-300",
  };

  return (
    <div className="rounded-xl border border-white/10 bg-[#161922] p-5">
      <div className={`mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg text-lg ${accents[accent]}`}>
        <Icon />
      </div>
      <div className="text-2xl font-semibold text-white">{value}</div>
      <div className="text-sm text-gray-400">{label}</div>
    </div>
  );
}
