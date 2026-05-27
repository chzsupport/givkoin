import { FortunePanel } from './FortuneUi';
import type { FortuneWinRow, FortuneWinsSummary, WinsFilter } from './fortuneTypes';

export function WinsHistoryView({
  winsFilter,
  winsRows,
  winsSummary,
  onWinsFilterChange,
  onReloadWins,
  onExportWins,
}: {
  winsFilter: WinsFilter;
  winsRows: FortuneWinRow[];
  winsSummary: FortuneWinsSummary | null;
  onWinsFilterChange: (filter: WinsFilter) => void;
  onReloadWins: () => void;
  onExportWins: () => void;
}) {
  return (
    <FortunePanel title="История выигрышей (последние 90 дней)">
      <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
        <select className="input-field" value={winsFilter.gameType} onChange={(e) => onWinsFilterChange({ ...winsFilter, gameType: e.target.value })}>
          <option value="">Все игры</option>
          <option value="roulette">Рулетка</option>
          <option value="lottery">Лотерея</option>
        </select>
        <select className="input-field" value={winsFilter.rewardType} onChange={(e) => onWinsFilterChange({ ...winsFilter, rewardType: e.target.value })}>
          <option value="">Все награды</option>
          <option value="k">K</option>
          <option value="star">Star</option>
          <option value="spin">Spin</option>
        </select>
        <input className="input-field" placeholder="ID пользователя" value={winsFilter.userId} onChange={(e) => onWinsFilterChange({ ...winsFilter, userId: e.target.value })} />
        <input className="input-field" type="date" value={winsFilter.from} onChange={(e) => onWinsFilterChange({ ...winsFilter, from: e.target.value })} />
        <input className="input-field" type="date" value={winsFilter.to} onChange={(e) => onWinsFilterChange({ ...winsFilter, to: e.target.value })} />
        <button className="btn-primary" onClick={onReloadWins}>Применить</button>
      </div>
      <div className="flex gap-3 text-sm text-slate-300">
        <span>Всего: {winsSummary?.all?.count || 0}</span>
        <span>Сумма: {winsSummary?.all?.totalAmount || 0}</span>
        <button className="btn-secondary" onClick={onExportWins}>CSV</button>
      </div>
      <div className="max-h-80 overflow-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-slate-400">
              <th className="py-2">Время</th>
              <th className="py-2">Игра</th>
              <th className="py-2">Награда</th>
              <th className="py-2">Сумма</th>
              <th className="py-2">Пользователь</th>
              <th className="py-2">Детали</th>
            </tr>
          </thead>
          <tbody>
            {winsRows.map((row) => (
              <tr key={row._id} className="border-t border-white/5">
                <td className="py-2 text-slate-300">{new Date(row.occurredAt || row.createdAt || '').toLocaleString()}</td>
                <td className="py-2 text-slate-200">{row.gameType}</td>
                <td className="py-2 text-slate-200">{row.rewardType}</td>
                <td className="py-2 text-slate-300">{row.amount}</td>
                <td className="py-2 text-slate-300">{row.user?.nickname || row.user?.email || row.user?._id || '-'}</td>
                <td className="py-2 text-xs text-slate-400">{row.label || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </FortunePanel>
  );
}
