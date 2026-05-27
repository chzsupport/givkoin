import { Card } from '../../components/ui';
import type { AppealFilters } from './appealTypes';

export function AppealsFiltersCard({
  filters,
  onFiltersChange,
}: {
  filters: AppealFilters;
  onFiltersChange: (filters: AppealFilters) => void;
}) {
  return (
    <Card className="p-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="text-xs text-slate-400">Статус</label>
          <select
            className="input-field mt-1"
            value={filters.status}
            onChange={(e) => onFiltersChange({ ...filters, status: e.target.value })}
          >
            <option value="">Все</option>
            <option value="pending">Новая</option>
            <option value="resolved">Подтверждён</option>
            <option value="rejected">Отменён</option>
          </select>
        </div>
        <div className="flex items-end">
          <button
            onClick={() => onFiltersChange({ status: '', search: '', showFilters: true })}
            className="btn-secondary w-full"
          >
            Сбросить
          </button>
        </div>
      </div>
    </Card>
  );
}
