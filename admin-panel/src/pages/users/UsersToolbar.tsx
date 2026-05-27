import { Filter, Save, Search } from 'lucide-react';

export function UsersToolbar({
  search,
  showFilters,
  onSearchChange,
  onToggleFilters,
  onExportCsv,
}: {
  search: string;
  showFilters: boolean;
  onSearchChange: (value: string) => void;
  onToggleFilters: () => void;
  onExportCsv: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="relative w-full max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
        <input
          type="text"
          placeholder="Поиск по нику или email..."
          className="input-field pl-10"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={onToggleFilters}
          className={`btn-secondary ${showFilters ? 'ring-2 ring-blue-500' : ''}`}
        >
          <Filter size={18} />
          Фильтры
        </button>
        <button onClick={onExportCsv} className="btn-secondary">
          <Save size={18} />
          CSV
        </button>
      </div>
    </div>
  );
}
