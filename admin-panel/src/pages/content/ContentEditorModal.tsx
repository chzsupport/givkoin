import { AnimatePresence, motion } from 'framer-motion';
import { Save } from 'lucide-react';
import api from '../../api/client';
import LanguageToggle from '../../components/LanguageToggle';
import type { ContentLanguage } from '../../utils/localizedContent';
import { AdminNewsMediaPreview } from './AdminNewsMediaPreview';
import { normalizePostStatus } from './contentHelpers';
import type { AdminPost, PostForm } from './contentTypes';

export function ContentEditorModal({
  show,
  editingPost,
  activeLanguage,
  postForm,
  uploadingMedia,
  onLanguageChange,
  onFormChange,
  onUploadingMediaChange,
  onClose,
  onDelete,
  onSave,
}: {
  show: boolean;
  editingPost: AdminPost | null;
  activeLanguage: ContentLanguage;
  postForm: PostForm;
  uploadingMedia: boolean;
  onLanguageChange: (language: ContentLanguage) => void;
  onFormChange: (form: PostForm) => void;
  onUploadingMediaChange: (uploading: boolean) => void;
  onClose: () => void;
  onDelete: () => void;
  onSave: () => void;
}) {
  return (
    <AnimatePresence>
      {show && (
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
            className="relative w-full max-w-2xl glass-panel p-8 max-h-[90vh] overflow-y-auto"
          >
            <h3 className="text-xl font-bold text-white mb-6">
              {editingPost ? 'Редактировать пост' : 'Создать новый пост'}
            </h3>
            <div className="space-y-4">
              <div className="flex justify-end">
                <LanguageToggle value={activeLanguage} onChange={onLanguageChange} />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-slate-400">Заголовок</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Введите заголовок..."
                  value={activeLanguage === 'ru' ? postForm.title : postForm.enTitle}
                  onChange={(e) => onFormChange({
                    ...postForm,
                    ...(activeLanguage === 'ru' ? { title: e.target.value } : { enTitle: e.target.value }),
                  })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-slate-400">Содержание</label>
                <textarea
                  className="input-field min-h-[180px]"
                  placeholder="Текст поста..."
                  value={activeLanguage === 'ru' ? postForm.content : postForm.enContent}
                  onChange={(e) => onFormChange({
                    ...postForm,
                    ...(activeLanguage === 'ru' ? { content: e.target.value } : { enContent: e.target.value }),
                  })}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm text-slate-400">Медиа</label>
                <input
                  type="file"
                  className="hidden"
                  id="post-media-upload"
                  accept=".jpg,.jpeg,.png,.webp,.avif,.gif,.mp4,.webm,.mov,.m4v,.mp3,.m4a,.ogg,.wav,image/jpeg,image/png,image/webp,image/avif,image/gif,video/mp4,video/webm,video/quicktime,audio/mpeg,audio/mp4,audio/ogg,audio/wav"
                  onChange={async (e) => {
                    if (e.target.files && e.target.files[0]) {
                      const file = e.target.files[0];
                      const formData = new FormData();
                      formData.append('file', file);
                      onUploadingMediaChange(true);
                      try {
                        const res = await api.post('/api/upload', formData, {
                          headers: {
                            'Content-Type': 'multipart/form-data',
                          },
                        });
                        const url = res.data.url.startsWith('http') ? res.data.url : `${api.defaults.baseURL}${res.data.url}`;
                        onFormChange({ ...postForm, mediaUrl: url });
                      } catch (err) {
                        alert('Ошибка загрузки файла');
                      } finally {
                        onUploadingMediaChange(false);
                      }
                    }
                  }}
                />
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    className="input-field flex-1"
                    placeholder="https://... или загрузите файл"
                    value={postForm.mediaUrl}
                    onChange={(e) => onFormChange({ ...postForm, mediaUrl: e.target.value })}
                  />
                  <label htmlFor="post-media-upload" className="btn-secondary cursor-pointer">
                    {uploadingMedia ? 'Загрузка...' : 'Файл'}
                  </label>
                </div>
                <div className="text-xs text-slate-500">
                  Поддерживаются картинки, прямые видеофайлы и ссылки на YouTube, Vimeo, RuTube, Dailymotion и Google Drive.
                </div>
                {postForm.mediaUrl && (
                  <div className="mt-2 p-2 border border-white/10 rounded-lg bg-black/20">
                    <AdminNewsMediaPreview
                      mediaUrl={postForm.mediaUrl}
                      title={activeLanguage === 'ru' ? postForm.title : (postForm.enTitle || postForm.title)}
                    />
                  </div>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm text-slate-400">Статус</label>
                  <select
                    className="input-field"
                    value={postForm.status}
                    onChange={(e) => onFormChange({ ...postForm, status: normalizePostStatus(e.target.value) })}
                  >
                    <option value="draft">Черновик</option>
                    <option value="scheduled">Запланирован</option>
                    <option value="published">Опубликован</option>
                  </select>
                </div>
                {postForm.status === 'scheduled' && (
                  <div className="space-y-2">
                    <label className="text-sm text-slate-400">Дата публикации</label>
                    <input
                      type="datetime-local"
                      className="input-field"
                      value={postForm.scheduledAt}
                      onChange={(e) => onFormChange({ ...postForm, scheduledAt: e.target.value })}
                    />
                  </div>
                )}
              </div>
            </div>
            <div className="mt-8 flex gap-3">
              <button onClick={onClose} className="btn-secondary flex-1">
                Отмена
              </button>
              {editingPost && (
                <button
                  onClick={onDelete}
                  className="btn-secondary flex-1 !border-rose-500/40 !text-rose-300 hover:!bg-rose-500/10"
                >
                  Удалить пост
                </button>
              )}
              <button onClick={onSave} className="btn-primary flex-1">
                <Save size={18} />
                {editingPost ? 'Сохранить изменения' : 'Создать пост'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
