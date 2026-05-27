import type { ReactNode } from 'react';
import type { FortuneMode } from './fortuneTypes';

export function FortunePanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
      <div className="text-sm font-semibold text-white">{title}</div>
      {children}
    </div>
  );
}

export function FortuneMessage({ error, ok }: { error: string; ok: string }) {
  if (error) {
    return <div className="rounded-xl border border-rose-500/30 bg-rose-500/20 px-3 py-2 text-sm text-rose-300">{error}</div>;
  }
  if (ok) {
    return <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/20 px-3 py-2 text-sm text-emerald-300">{ok}</div>;
  }
  return null;
}

const MODE_TABS: { value: FortuneMode; label: string }[] = [
  { value: 'stats', label: 'Статистика' },
  { value: 'roulette', label: 'Рулетка' },
  { value: 'lottery', label: 'Лотерея' },
  { value: 'wins', label: 'Выигрыши 90 дней' },
];

export function FortuneModeTabs({
  mode,
  onModeChange,
  onReload,
}: {
  mode: FortuneMode;
  onModeChange: (mode: FortuneMode) => void;
  onReload: () => void;
}) {
  return (
    <div className="flex gap-2 flex-wrap">
      {MODE_TABS.map((tab) => (
        <button
          key={tab.value}
          className={`btn-secondary ${mode === tab.value ? 'ring-2 ring-cyan-400/40' : ''}`}
          onClick={() => onModeChange(tab.value)}
        >
          {tab.label}
        </button>
      ))}
      <button className="btn-secondary" onClick={onReload}>Обновить</button>
    </div>
  );
}
