import { AnimatePresence, motion } from 'framer-motion';
import { AD_TARGET_OPTIONS } from './adTargets';
import type { AdCreative, CreativeForm } from './adTypes';

export function CreativeModal({
  show,
  editingCreative,
  creativeForm,
  onFormChange,
  onClose,
  onCancel,
  onSave,
}: {
  show: boolean;
  editingCreative: AdCreative | null;
  creativeForm: CreativeForm;
  onFormChange: (form: CreativeForm) => void;
  onClose: () => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const toggleTargetPage = (pageId: string) => {
    const current = Array.isArray(creativeForm.targetPages) ? creativeForm.targetPages : ['all'];
    if (pageId === 'all') {
      onFormChange({ ...creativeForm, targetPages: ['all'] });
      return;
    }
    const withoutAll = current.filter((id) => id !== 'all');
    const next = withoutAll.includes(pageId)
      ? withoutAll.filter((id) => id !== pageId)
      : [...withoutAll, pageId];
    onFormChange({ ...creativeForm, targetPages: next.length ? next : ['all'] });
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="glass-panel p-6 w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-bold text-white mb-4">{editingCreative ? 'Редактировать креатив' : 'Новый креатив'}</h3>
            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
              <div>
                <label className="text-sm font-medium text-slate-300">Название</label>
                <input
                  className="input-field mt-1"
                  value={creativeForm.name}
                  onChange={(e) => onFormChange({ ...creativeForm, name: e.target.value })}
                  placeholder="Моя реклама"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-300">Тип</label>
                <select
                  className="input-field mt-1"
                  value={creativeForm.type}
                  onChange={(e) => onFormChange({ ...creativeForm, type: e.target.value })}
                >
                  <option value="banner">Баннер</option>
                  <option value="vast">VAST</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-300">
                  {creativeForm.type === 'vast' ? 'VAST ссылка DAO.ad' : 'Код баннера'}
                </label>
                <textarea
                  className="input-field mt-1 min-h-[150px] font-mono text-sm"
                  value={creativeForm.content}
                  onChange={(e) => onFormChange({ ...creativeForm, content: e.target.value })}
                  placeholder={creativeForm.type === 'vast' ? 'https://... VAST link DAO.ad' : '<script...> или <div...>'}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-300">Где показывать</label>
                <div className="mt-2 grid max-h-52 grid-cols-1 gap-2 overflow-y-auto rounded-xl border border-white/10 bg-black/20 p-3 sm:grid-cols-2">
                  {AD_TARGET_OPTIONS.map((target) => {
                    const selected = Array.isArray(creativeForm.targetPages) && creativeForm.targetPages.includes(target.id);
                    return (
                      <label key={target.id} className="flex items-center gap-2 text-sm text-slate-300">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleTargetPage(target.id)}
                        />
                        <span>{target.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-300">Приоритет</label>
                <input
                  type="number"
                  className="input-field mt-1"
                  value={creativeForm.priority}
                  onChange={(e) => onFormChange({ ...creativeForm, priority: Number(e.target.value) })}
                  placeholder="0"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-300">Время показа (сек)</label>
                <input
                  type="number"
                  className="input-field mt-1"
                  value={creativeForm.duration}
                  onChange={(e) => onFormChange({ ...creativeForm, duration: Number(e.target.value) })}
                  placeholder="10"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button onClick={onCancel} className="btn-secondary flex-1">Отмена</button>
                <button onClick={onSave} className="btn-primary flex-1">{editingCreative ? 'Сохранить' : 'Создать'}</button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
