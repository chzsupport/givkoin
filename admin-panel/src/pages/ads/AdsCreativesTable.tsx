import { Edit3, Plus, Trash2 } from 'lucide-react';
import { Badge, Card } from '../../components/ui';
import { getCreativeTypeLabel, getTargetLabel } from './adFormatters';
import type { AdCreative } from './adTypes';

export function AdsCreativesTable({
  creatives,
  onCreate,
  onToggleActive,
  onEdit,
  onDelete,
}: {
  creatives: AdCreative[];
  onCreate: () => void;
  onToggleActive: (id: string, active: boolean) => void;
  onEdit: (creative: AdCreative) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <Card title="Креативы" subtitle="Управление рекламными материалами">
      <div className="mb-4 flex justify-end">
        <button onClick={onCreate} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Добавить креатив
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-white/10 text-xs uppercase text-slate-400">
              <th className="pb-3 font-medium">Название</th>
              <th className="pb-3 font-medium">Тип</th>
              <th className="pb-3 font-medium">Страницы</th>
              <th className="pb-3 font-medium">Длительность</th>
              <th className="pb-3 font-medium">Показов</th>
              <th className="pb-3 font-medium">Статус</th>
              <th className="pb-3 font-medium">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {creatives.map((creative) => (
              <tr key={creative._id} className="text-sm">
                <td className="py-3 text-white">{creative.name}</td>
                <td className="py-3 text-slate-300">{getCreativeTypeLabel(creative)}</td>
                <td className="py-3 text-slate-300">
                  {(Array.isArray(creative.targetPages) ? creative.targetPages : ['all']).map(getTargetLabel).join(', ')}
                </td>
                <td className="py-3 text-slate-300">
                  {creative.duration || 10} сек.
                </td>
                <td className="py-3 text-slate-300">{(creative.impressions || 0).toLocaleString()}</td>
                <td className="py-3">
                  <Badge variant={creative.active ? 'success' : 'default'}>
                    {creative.active ? 'Активен' : 'Выключен'}
                  </Badge>
                </td>
                <td className="py-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => onToggleActive(creative._id, Boolean(creative.active))}
                      className="text-blue-400 hover:text-blue-300"
                    >
                      {creative.active ? 'Выключить' : 'Включить'}
                    </button>
                    <button
                      onClick={() => onEdit(creative)}
                      className="text-amber-400 hover:text-amber-300"
                    >
                      <Edit3 size={16} />
                    </button>
                    <button
                      onClick={() => onDelete(creative._id)}
                      className="text-rose-400 hover:text-rose-300"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {creatives.length === 0 && (
              <tr><td colSpan={7} className="py-8 text-center text-slate-500">Нет креативов</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
