import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { RefreshCw, Search, Trash2 } from 'lucide-react';
import api from '../api/client';
import { Card } from '../components/ui';
import { FRONTEND_BASE_URL } from '../config/env';

function EntitiesSection() {
  const [entities, setEntities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEntity, setSelectedEntity] = useState<any | null>(null);
  const [avatarInput, setAvatarInput] = useState('');

  const normalizeAvatarUrl = (url?: string) => {
    if (!url) return '';
    if (/^https?:\/\//i.test(url)) return url;
    if (url.startsWith('/collection/') || url.startsWith('/entitycollect/')) {
      return `${FRONTEND_BASE_URL}${url}`;
    }
    const apiBase = api.defaults.baseURL || '';
    return `${apiBase}${url.startsWith('/') ? '' : '/'}${url}`;
  };

  const formatMood = (mood?: string) => {
    if (!mood) return 'Нейтральное';
    const map: Record<string, string> = {
      happy: 'Радостное',
      neutral: 'Нейтральное',
      sad: 'Грустное',
    };
    return map[mood] || mood;
  };

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.get('/admin/entities');
        setEntities(data.data?.entities || data.data || []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('Удалить эту сущность?')) return;
    try {
      await api.delete(`/admin/entities/${id}`);
      setEntities(entities.filter(e => e._id !== id));
    } catch (e) {
      alert('Ошибка удаления');
    }
  };

  const handleOpen = (entity: any) => {
    setSelectedEntity(entity);
    setAvatarInput(entity.avatarUrl || '');
  };

  const handleClose = () => {
    setSelectedEntity(null);
    setAvatarInput('');
  };

  const handleSaveAvatar = async () => {
    if (!selectedEntity || !avatarInput.trim()) return;
    try {
      const res = await api.patch(`/admin/entities/${selectedEntity._id}/avatar`, {
        avatarUrl: avatarInput.trim()
      });
      const updated = res.data?.entity || res.data;
      setEntities(prev => prev.map(e => (e._id === updated._id ? updated : e)));
      setSelectedEntity(updated);
    } catch (e) {
      alert('Ошибка сохранения аватара');
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><RefreshCw className="animate-spin text-slate-500" size={32} /></div>;
  }

  return (
    <div className="space-y-6">
      <Card title="Сущности пользователей" subtitle="Управление созданными аватарами">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {entities.length === 0 ? (
            <p className="col-span-full py-8 text-center text-slate-500">Нет созданных сущностей</p>
          ) : entities.map((entity: any) => (
            <div key={entity._id} className="flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-white/10">
              {entity.avatarUrl ? (
                <button onClick={() => handleOpen(entity)} className="w-12 h-12 rounded-full overflow-hidden">
                  <img src={normalizeAvatarUrl(entity.avatarUrl)} alt="" className="w-full h-full object-cover" />
                </button>
              ) : (
                <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold">
                  {entity.name?.[0]?.toUpperCase() || '?'}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-white truncate">{entity.name}</p>
                <p className="text-xs text-slate-500">Настроение: {formatMood(entity.mood)}</p>
                <p className="text-xs text-slate-500">Создан: {new Date(entity.createdAt).toLocaleDateString()}</p>
              </div>
              <button
                onClick={() => handleOpen(entity)}
                className="text-blue-400 hover:text-blue-300"
                title="Открыть"
              >
                <Search size={16} />
              </button>
              <button
                onClick={() => handleDelete(entity._id)}
                className="text-rose-400 hover:text-rose-300"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      </Card>
      <AnimatePresence>
        {selectedEntity && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={handleClose}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-2xl rounded-2xl bg-slate-900 border border-white/10 p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Сущность пользователя</h3>
                <button onClick={handleClose} className="text-slate-400 hover:text-white">✕</button>
              </div>
              <div className="grid gap-4 md:grid-cols-[200px,1fr]">
                <div className="rounded-xl overflow-hidden border border-white/10 bg-black/40">
                  {selectedEntity.avatarUrl ? (
                    <img src={normalizeAvatarUrl(selectedEntity.avatarUrl)} alt="" className="w-full h-full object-contain" />
                  ) : (
                    <div className="w-full h-48 flex items-center justify-center text-slate-500">Нет изображения</div>
                  )}
                </div>
                <div className="space-y-2 text-sm text-slate-300">
                  <div><span className="text-slate-500">Имя:</span> {selectedEntity.name}</div>
                  <div><span className="text-slate-500">Пользователь:</span> {selectedEntity.user?.nickname || '—'} ({selectedEntity.user?.email || '—'})</div>
                  <div><span className="text-slate-500">Настроение:</span> {formatMood(selectedEntity.mood)}</div>
                  <div><span className="text-slate-500">Создан:</span> {new Date(selectedEntity.createdAt).toLocaleString()}</div>
                  <div className="pt-2">
                    <label className="text-slate-500 text-xs uppercase">Новый аватар URL</label>
                    <input
                      value={avatarInput}
                      onChange={(e) => setAvatarInput(e.target.value)}
                      className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white"
                      placeholder="https://..."
                    />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button onClick={handleSaveAvatar} className="btn-primary">Сохранить</button>
                    <button onClick={handleClose} className="btn-secondary">Закрыть</button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default EntitiesSection;
