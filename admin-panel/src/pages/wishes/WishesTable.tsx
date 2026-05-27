import { Coins, Edit3, Heart, Trash2 } from 'lucide-react';
import { Badge, Card } from '../../components/ui';
import { formatAdminK } from '../../utils/adminFormat';
import { getWishStatusVariant } from './wishHelpers';
import type { WishRow } from './wishTypes';

export function WishesTable({
  wishes,
  loading,
  onEdit,
  onDelete,
}: {
  wishes: WishRow[];
  loading: boolean;
  onEdit: (wish: WishRow) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-white/10 bg-white/5 text-xs uppercase tracking-wider text-slate-400">
            <tr>
              <th className="px-6 py-4 font-semibold">Автор</th>
              <th className="px-6 py-4 font-semibold">Исполнитель</th>
              <th className="px-6 py-4 font-semibold">Текст желания</th>
              <th className="px-6 py-4 font-semibold">Статус</th>
              <th className="px-6 py-4 font-semibold">Поддержка</th>
              <th className="px-6 py-4 font-semibold text-right">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-6 py-10 text-center text-slate-500">Загрузка...</td>
              </tr>
            ) : wishes.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-10 text-center text-slate-500">Желания не найдены</td>
              </tr>
            ) : wishes.map((wish) => (
              <tr key={wish._id} className="group hover:bg-white/5 transition-colors">
                <td className="px-6 py-4">
                  <div className="font-medium text-white">{wish.author?.nickname || 'Удален'}</div>
                  <div className="text-xs text-slate-500">{wish.author?.email || '-'}</div>
                </td>
                <td className="px-6 py-4">
                  {wish.executor ? (
                    <>
                      <div className="font-medium text-blue-400">{wish.executor.nickname}</div>
                      <div className="text-caption text-slate-500">{wish.executor.email}</div>
                      {wish.status === 'pending' && (
                        <div className="mt-1 rounded-md border border-amber-400/30 bg-amber-400/10 px-2 py-1 text-caption text-amber-200">
                          Нужна ручная проверка модератора
                        </div>
                      )}
                      {wish.executorContact && (
                        <div className="mt-1 text-caption text-amber-300 break-all">Контакт: {wish.executorContact}</div>
                      )}
                    </>
                  ) : (
                    <span className="text-slate-600">—</span>
                  )}
                </td>
                <td className="px-6 py-4 max-w-xs">
                  <p className="line-clamp-2 text-slate-300 italic">"{wish.text}"</p>
                </td>
                <td className="px-6 py-4">
                  <Badge variant={getWishStatusVariant(wish.status)}>
                    {wish.status}
                  </Badge>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1 text-rose-400 text-xs">
                      <Heart size={12} /> {wish.supportCount}
                    </div>
                    <div className="flex items-center gap-1 text-amber-400 text-xs">
                      <Coins size={12} /> {formatAdminK(wish.supportK)} K
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => onEdit(wish)}
                      className="rounded-lg p-2 text-slate-400 hover:bg-blue-500/20 hover:text-blue-400 transition-colors"
                    >
                      <Edit3 size={18} />
                    </button>
                    <button
                      onClick={() => onDelete(wish._id)}
                      className="rounded-lg p-2 text-slate-400 hover:bg-rose-500/20 hover:text-rose-400 transition-colors"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
