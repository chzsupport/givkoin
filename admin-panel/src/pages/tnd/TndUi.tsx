import type { TndTab, TndTone } from './tndTypes';

export function TndStatCard({
  label,
  value,
  tone = 'blue',
}: {
  label: string;
  value: string | number;
  tone?: TndTone;
}) {
  const toneClass = {
    blue: 'text-blue-300 border-blue-500/20 bg-blue-500/10',
    green: 'text-emerald-300 border-emerald-500/20 bg-emerald-500/10',
    red: 'text-rose-300 border-rose-500/20 bg-rose-500/10',
    amber: 'text-amber-300 border-amber-500/20 bg-amber-500/10',
    slate: 'text-slate-300 border-white/10 bg-white/5',
  }[tone];

  return (
    <div className={`rounded-2xl border p-4 ${toneClass}`}>
      <div className="text-sm text-slate-400">{label}</div>
      <div className="mt-2 text-2xl font-bold text-white">{value}</div>
    </div>
  );
}

export function TndTabs({
  tab,
  onTabChange,
}: {
  tab: TndTab;
  onTabChange: (tab: TndTab) => void;
}) {
  const tabs: Array<{ id: TndTab; label: string }> = [
    { id: 'daily', label: 'Дневная активность' },
    { id: 'referrals', label: 'Рефералы 30 дней' },
    { id: 'rules', label: 'Правила' },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((item) => (
        <button
          key={item.id}
          onClick={() => onTabChange(item.id)}
          className={`rounded-full px-4 py-2 text-sm font-semibold border transition ${tab === item.id
            ? 'bg-blue-600 text-white border-blue-500'
            : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'}`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
