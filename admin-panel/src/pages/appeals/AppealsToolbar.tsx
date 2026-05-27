import { Filter, RefreshCw, Save, Search } from 'lucide-react';
import type { AppealFilters } from './appealTypes';

export function AppealsToolbar({
  filters,
  onFiltersChange,
  onExportCsv,
  onReload,
}: {
  filters: AppealFilters;
  onFiltersChange: (filters: AppealFilters) => void;
  onExportCsv: () => void;
  onReload: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="relative w-full max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
        <input
          type="text"
          placeholder="Поиск по нику или причине..."
          className="input-field pl-10"
          value={filters.search}
          onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onFiltersChange({ ...filters, showFilters: !filters.showFilters })}
          className={`btn-secondary ${filters.showFilters ? 'ring-2 ring-blue-500' : ''}`}
        >
          <Filter size={18} />
          Фильтры
        </button>
        <button onClick={onExportCsv} className="btn-secondary">
          <Save size={18} />
          CSV
        </button>
        <button onClick={onReload} className="btn-secondary">
          <RefreshCw size={18} />
        </button>
      </div>
    </div>
  );
}
