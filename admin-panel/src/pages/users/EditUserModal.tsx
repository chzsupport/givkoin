import { AnimatePresence, motion } from 'framer-motion';
import { Save } from 'lucide-react';
import type { AdminUser, EditUserForm, UserStatus } from './userTypes';

export function EditUserModal({
  editingUser,
  editForm,
  onEditFormChange,
  onClose,
  onSave,
}: {
  editingUser: AdminUser | null;
  editForm: EditUserForm;
  onEditFormChange: (form: EditUserForm) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <AnimatePresence>
      {editingUser && (
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
            <h3 className="text-xl font-bold text-white mb-6">Редактирование: {editingUser.nickname}</h3>
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm text-slate-400">K (Валюта)</label>
                <input
                  type="number"
                  className="input-field"
                  value={editForm.k}
                  onChange={(e) => onEditFormChange({ ...editForm, k: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-slate-400">Жизни</label>
                <input
                  type="number"
                  className="input-field"
                  value={editForm.lives}
                  onChange={(e) => onEditFormChange({ ...editForm, lives: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-slate-400">Звезды</label>
                <input
                  type="number"
                  step="0.01"
                  className="input-field"
                  value={editForm.stars}
                  onChange={(e) => onEditFormChange({ ...editForm, stars: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-slate-400">Люмены</label>
                <input
                  type="number"
                  className="input-field"
                  value={editForm.lumens}
                  onChange={(e) => onEditFormChange({ ...editForm, lumens: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <label className="text-sm text-slate-400">Статус</label>
                <select
                  className="input-field"
                  value={editForm.status}
                  onChange={(e) => onEditFormChange({ ...editForm, status: e.target.value as UserStatus })}
                >
                  <option value="active">Активен</option>
                  <option value="banned">Забанен</option>
                  <option value="pending">Ожидание</option>
                </select>
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
