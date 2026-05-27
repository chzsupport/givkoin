const STATUS_TABS = [
  { value: '', label: 'Все' },
  { value: 'draft', label: 'Черновики' },
  { value: 'scheduled', label: 'Запланированы' },
  { value: 'published', label: 'Опубликованы' },
];

export function ContentStatusTabs({
  statusFilter,
  onStatusFilterChange,
}: {
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
}) {
  return (
    <div className="flex gap-2 flex-wrap">
      {STATUS_TABS.map(tab => (
        <button
          key={tab.value}
          onClick={() => onStatusFilterChange(tab.value)}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${statusFilter === tab.value
            ? 'bg-blue-600 text-white'
            : 'bg-white/5 text-slate-400 hover:bg-white/10'
            }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
