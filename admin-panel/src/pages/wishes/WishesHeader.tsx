import { RefreshCw } from 'lucide-react';

export function WishesHeader({
  statusFilter,
  pendingFulfillmentCount,
  onStatusFilterChange,
  onReload,
}: {
  statusFilter: string;
  pendingFulfillmentCount: number;
  onStatusFilterChange: (status: string) => void;
  onReload: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h2 className="text-xl font-bold text-white">Управление желаниями</h2>
        {pendingFulfillmentCount > 0 && (
          <div className="mt-1 text-sm text-amber-300">
            Заявок на исполнение ждёт ручной проверки: {pendingFulfillmentCount}
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onStatusFilterChange('pending')}
          className="btn-secondary"
        >
          Заявки на исполнение
        </button>
        <select
          className="input-field w-48"
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value)}
        >
          <option value="">Все статусы</option>
          <option value="open">Открыто</option>
          <option value="supported">Поддержано</option>
          <option value="pending">В процессе</option>
          <option value="fulfilled">Исполнено</option>
          <option value="archived">Архив</option>
        </select>
        <button onClick={onReload} className="btn-secondary">
          <RefreshCw size={18} />
        </button>
      </div>
    </div>
  );
}
