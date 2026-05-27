import { RefreshCw } from 'lucide-react';

export function TndHeader({ onReload }: { onReload: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h2 className="text-xl font-bold text-white">Тихий Ночной Дозор</h2>
        <p className="text-sm text-slate-400">Проверка активности юзеров и рефералов.</p>
      </div>
      <button
        onClick={onReload}
        className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10"
      >
        <RefreshCw size={16} />
        Обновить
      </button>
    </div>
  );
}
