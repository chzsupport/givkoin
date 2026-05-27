export function SecurityHeader({
  statusFilter,
  isLoading,
  isActionLoading,
  onStatusFilterChange,
  onRefresh,
}: {
  statusFilter: string;
  isLoading: boolean;
  isActionLoading: boolean;
  onStatusFilterChange: (value: string) => void;
  onRefresh: () => void;
}) {
  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
      <div className="text-sm text-slate-300">Связанные группы, заморозка и сигналы входа</div>
      <div className="flex flex-col sm:flex-row gap-2">
        <select className="input-field pr-10" style={{ colorScheme: 'dark' }} value={statusFilter} onChange={(event) => onStatusFilterChange(event.target.value)}>
          <option value="">Все статусы</option>
          <option value="watch">Под наблюдением</option>
          <option value="high_risk">Сильное подозрение</option>
          <option value="frozen">Заморожены системой</option>
          <option value="resolved">Решение принято</option>
        </select>
        <button className="btn-secondary" disabled={isLoading || isActionLoading} onClick={onRefresh}>Обновить</button>
      </div>
    </div>
  );
}
