import { Card } from '../../components/ui';
import type { UserFilters } from './userTypes';

const emptyVisibleFilters: UserFilters = {
  status: '',
  minLives: '',
  minStars: '',
  showFilters: true,
};

export function UsersFiltersCard({
  filters,
  onFiltersChange,
  onPageReset,
}: {
  filters: UserFilters;
  onFiltersChange: (filters: UserFilters) => void;
  onPageReset: () => void;
}) {
  const updateFilters = (nextFilters: UserFilters) => {
    onFiltersChange(nextFilters);
    onPageReset();
  };

  return (
    <Card className="p-4">
      <div className="grid gap-4 sm:grid-cols-4">
        <div>
          <label className="text-xs text-slate-400">Статус</label>
          <select
            className="input-field mt-1"
            value={filters.status}
            onChange={(e) => updateFilters({ ...filters, status: e.target.value })}
          >
            <option value="">Все</option>
            <option value="active">Активен</option>
            <option value="banned">Забанен</option>
            <option value="pending">Ожидание</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-400">Мин. жизней</label>
          <input
            type="number"
            className="input-field mt-1"
            placeholder="0"
            value={filters.minLives}
            onChange={(e) => updateFilters({ ...filters, minLives: e.target.value })}
          />
        </div>
        <div>
          <label className="text-xs text-slate-400">Мин. звёзд</label>
          <input
            type="number"
            step="0.1"
            className="input-field mt-1"
            placeholder="0"
            value={filters.minStars}
            onChange={(e) => updateFilters({ ...filters, minStars: e.target.value })}
          />
        </div>
        <div className="flex items-end">
          <button
            onClick={() => updateFilters(emptyVisibleFilters)}
            className="btn-secondary w-full"
          >
            Сбросить
          </button>
        </div>
      </div>
    </Card>
  );
}
