import {
  Coins,
  Edit3,
  Heart,
  MessageSquare,
  RefreshCw,
  Star,
  Trash2,
  Zap,
} from 'lucide-react';
import { Badge, Card } from '../../components/ui';
import { formatAdminK } from '../../utils/adminFormat';
import { getUserStatusLabel, getUserStatusVariant } from './userHelpers';
import type { AdminUser } from './userTypes';

export function UsersTable({
  users,
  loading,
  onViewChats,
  onResetPassword,
  onEdit,
  onDelete,
}: {
  users: AdminUser[];
  loading: boolean;
  onViewChats: (user: AdminUser) => void;
  onResetPassword: (id: string) => void;
  onEdit: (user: AdminUser) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-white/10 bg-white/5 text-xs uppercase tracking-wider text-slate-400">
            <tr>
              <th className="px-6 py-4 font-semibold">Пользователь</th>
              <th className="px-6 py-4 font-semibold">Статус</th>
              <th className="px-6 py-4 font-semibold">Ресурсы</th>
              <th className="px-6 py-4 font-semibold">Статистика</th>
              <th className="px-6 py-4 font-semibold text-right">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-6 py-10 text-center text-slate-500">Загрузка...</td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-10 text-center text-slate-500">Пользователи не найдены</td>
              </tr>
            ) : users.filter(Boolean).map((user) => (
              <tr key={user._id} className="group hover:bg-white/5 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center text-white font-bold">
                      {user.nickname?.[0]?.toUpperCase() || '?'}
                    </div>
                    <div>
                      <div className="font-medium text-white">{user.nickname}</div>
                      <div className="text-xs text-slate-500">{user.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <Badge variant={getUserStatusVariant(user.status)}>
                    {getUserStatusLabel(user.status)}
                  </Badge>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-wrap gap-2">
                    <div className="flex items-center gap-1 text-amber-400">
                      <Coins size={14} />
                      <span className="font-medium">{formatAdminK(user.k)}</span>
                    </div>
                    <div className="flex items-center gap-1 text-rose-400">
                      <Heart size={14} />
                      <span className="font-medium">{user.lives}</span>
                    </div>
                    <div className="flex items-center gap-1 text-blue-400">
                      <Zap size={14} />
                      <span className="font-medium">{user.lumens}</span>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-1 text-yellow-400">
                    <Star size={14} />
                    <span className="font-medium">{user.stars}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => onViewChats(user)}
                      className="rounded-lg p-2 text-slate-400 hover:bg-blue-500/20 hover:text-blue-400 transition-colors"
                      title="История чатов"
                    >
                      <MessageSquare size={18} />
                    </button>
                    <button
                      onClick={() => onResetPassword(user._id)}
                      className="rounded-lg p-2 text-slate-400 hover:bg-amber-500/20 hover:text-amber-400 transition-colors"
                      title="Сбросить пароль"
                    >
                      <RefreshCw size={18} />
                    </button>
                    <button
                      onClick={() => onEdit(user)}
                      className="rounded-lg p-2 text-slate-400 hover:bg-blue-500/20 hover:text-blue-400 transition-colors"
                      title="Редактировать"
                    >
                      <Edit3 size={18} />
                    </button>
                    <button
                      onClick={() => onDelete(user._id)}
                      className="rounded-lg p-2 text-slate-400 hover:bg-rose-500/20 hover:text-rose-400 transition-colors"
                      title="Удалить"
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
