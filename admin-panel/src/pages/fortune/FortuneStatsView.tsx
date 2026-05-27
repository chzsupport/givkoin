import { FortunePanel } from './FortuneUi';
import type { FortuneStats } from './fortuneTypes';

export function FortuneStatsView({ stats }: { stats: FortuneStats | null }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
      <FortunePanel title="Рулетка: всего вращений">
        <div className="text-2xl font-bold text-white">{stats?.roulette?.totalSpins || 0}</div>
      </FortunePanel>
      <FortunePanel title="Рулетка: активных игроков">
        <div className="text-2xl font-bold text-white">{stats?.roulette?.activeUsers || 0}</div>
      </FortunePanel>
      <FortunePanel title="Лотерея: всего билетов">
        <div className="text-2xl font-bold text-white">{stats?.lottery?.totalTickets || 0}</div>
      </FortunePanel>
      <FortunePanel title="Лотерея: выплачено K">
        <div className="text-2xl font-bold text-white">{stats?.lottery?.totalPrizesPaid || 0}</div>
      </FortunePanel>
    </div>
  );
}
