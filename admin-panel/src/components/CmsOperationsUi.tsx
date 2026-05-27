import type { ReactNode } from 'react';

export function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
      <div className="text-sm font-semibold text-white">{title}</div>
      {children}
    </div>
  );
}

export function StateMessage({ error, ok }: { error: string; ok: string }) {
  if (error) {
    return <div className="rounded-xl border border-rose-500/30 bg-rose-500/20 px-3 py-2 text-sm text-rose-300">{error}</div>;
  }

  if (ok) {
    return <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/20 px-3 py-2 text-sm text-emerald-300">{ok}</div>;
  }

  return null;
}
