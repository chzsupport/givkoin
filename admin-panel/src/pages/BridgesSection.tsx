import { useEffect, useState } from 'react';
import { RefreshCw, Trash2 } from 'lucide-react';

import api from '../api/client';
import { Badge, Card } from '../components/ui';

type BridgeRow = {
  _id: string;
  fromCountry?: string;
  toCountry?: string;
  currentStones: number;
  requiredStones: number;
  contributors?: unknown[];
  status?: string;
};

export default function BridgesSection() {
  const [bridges, setBridges] = useState<BridgeRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadBridges = async () => {
    try {
      const data = await api.get('/bridges');
      setBridges(data.data?.bridges || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBridges();
  }, []);

  const handleDelete = async (bridgeId: string) => {
    if (!confirm('Удалить этот мост?')) return;
    try {
      await api.delete(`/bridges/${bridgeId}`);
      loadBridges();
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><RefreshCw className="animate-spin text-slate-500" size={32} /></div>;
  }

  return (
    <div className="space-y-6">
      <Card title="Мосты Мира" subtitle="Активные межстрановые мосты">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase text-slate-400">
                <th className="pb-3 font-medium">Маршрут</th>
                <th className="pb-3 font-medium">Прогресс</th>
                <th className="pb-3 font-medium">Участников</th>
                <th className="pb-3 font-medium">Статус</th>
                <th className="pb-3 font-medium">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {bridges.length === 0 ? (
                <tr><td colSpan={5} className="py-8 text-center text-slate-500">Нет активных мостов</td></tr>
              ) : bridges.map((bridge) => (
                <tr key={bridge._id} className="text-sm">
                  <td className="py-3 text-white">{bridge.fromCountry} → {bridge.toCountry}</td>
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 max-w-[100px] rounded-full bg-slate-700">
                        <div
                          className="h-2 rounded-full bg-blue-500"
                          style={{ width: `${Math.min(100, (bridge.currentStones / bridge.requiredStones) * 100)}%` }}
                        />
                      </div>
                      <span className="text-slate-400">{bridge.currentStones}/{bridge.requiredStones}</span>
                    </div>
                  </td>
                  <td className="py-3 text-slate-300">{bridge.contributors?.length || 0}</td>
                  <td className="py-3">
                    <Badge variant={bridge.status === 'completed' ? 'success' : 'info'}>
                      {bridge.status === 'completed' ? 'Завершён' : 'Строится'}
                    </Badge>
                  </td>
                  <td className="py-3">
                    <button
                      onClick={() => handleDelete(bridge._id)}
                      className="text-rose-400 hover:text-rose-300"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
