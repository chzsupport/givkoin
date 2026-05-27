import { AnimatePresence, motion } from 'framer-motion';
import { Save } from 'lucide-react';
import type { WishEditForm, WishRow } from './wishTypes';

export function WishEditModal({
  editingWish,
  editForm,
  onEditFormChange,
  onClose,
  onSave,
}: {
  editingWish: WishRow | null;
  editForm: WishEditForm;
  onEditFormChange: (form: WishEditForm) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <AnimatePresence>
      {editingWish && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative w-full max-w-lg glass-panel p-8"
          >
            <h3 className="text-xl font-bold text-white mb-6">Редактирование желания</h3>
            <div className="space-y-6">
              {editingWish.status === 'pending' && editingWish.executor && (
                <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">
                  Это заявка на исполнение. Контакт исполнителя передаётся автору только после ручной проверки модератором.
                </div>
              )}
              <div className="space-y-2">
                <label className="text-sm text-slate-400">Текст желания</label>
                <textarea
                  className="input-field min-h-[120px] resize-none"
                  value={editForm.text}
                  onChange={(e) => onEditFormChange({ ...editForm, text: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm text-slate-400">Статус</label>
                  <select
                    className="input-field"
                    value={editForm.status}
                    onChange={(e) => onEditFormChange({ ...editForm, status: e.target.value })}
                  >
                    <option value="open">Открыто</option>
                    <option value="supported">Поддержано</option>
                    <option value="pending">В процессе</option>
                    <option value="fulfilled">Исполнено</option>
                    <option value="archived">Архив</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-slate-400">Поддержка (K)</label>
                  <input
                    type="number"
                    className="input-field"
                    value={editForm.supportK}
                    onChange={(e) => onEditFormChange({ ...editForm, supportK: Number(e.target.value) })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm text-slate-400">Контакт исполнителя</label>
                <input
                  className="input-field"
                  value={editForm.executorContact}
                  onChange={(e) => onEditFormChange({ ...editForm, executorContact: e.target.value })}
                  placeholder="Телеграм, почта или другой контакт"
                />
              </div>
            </div>
            <div className="mt-8 flex gap-3">
              <button
                onClick={onClose}
                className="btn-secondary flex-1"
              >
                Отмена
              </button>
              <button
                onClick={onSave}
                className="btn-primary flex-1"
              >
                <Save size={18} />
                Сохранить
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
