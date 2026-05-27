export function ContentBulkActions({
  allFilteredSelected,
  selectedCount,
  onToggleAllFiltered,
  onClearSelection,
  onDeleteSelected,
}: {
  allFilteredSelected: boolean;
  selectedCount: number;
  onToggleAllFiltered: () => void;
  onClearSelection: () => void;
  onDeleteSelected: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 p-3">
      <label className="flex cursor-pointer items-center gap-3 text-sm text-slate-300">
        <input
          type="checkbox"
          checked={allFilteredSelected}
          onChange={onToggleAllFiltered}
          className="h-4 w-4 rounded border-white/20 bg-slate-900"
        />
        <span>Отметить все видимые посты</span>
      </label>
      <div className="flex items-center gap-3">
        <span className="text-sm text-slate-400">Выбрано: {selectedCount}</span>
        {selectedCount > 0 && (
          <>
            <button
              onClick={onClearSelection}
              className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/5"
            >
              Снять выбор
            </button>
            <button
              onClick={onDeleteSelected}
              className="rounded-lg border border-rose-500/40 px-3 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-500/10"
            >
              Удалить выбранные
            </button>
          </>
        )}
      </div>
    </div>
  );
}
