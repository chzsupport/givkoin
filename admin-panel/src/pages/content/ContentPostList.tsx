import { Clock } from 'lucide-react';
import { Badge, Card } from '../../components/ui';
import {
  getLocalizedTextValue,
  getTranslatedField,
  type ContentLanguage,
} from '../../utils/localizedContent';
import { AdminNewsMediaPreview } from './AdminNewsMediaPreview';
import { getPostId, getPostPreview } from './contentHelpers';
import type { AdminPost } from './contentTypes';

export function ContentPostList({
  loading,
  posts,
  activeLanguage,
  selectedPostIdsSet,
  onTogglePostSelection,
  onPublish,
  onEdit,
  onDelete,
}: {
  loading: boolean;
  posts: AdminPost[];
  activeLanguage: ContentLanguage;
  selectedPostIdsSet: Set<string>;
  onTogglePostSelection: (id: string) => void;
  onPublish: (id: string) => void;
  onEdit: (post: AdminPost) => void;
  onDelete: (id: string) => void;
}) {
  if (loading) {
    return <div className="text-center py-10 text-slate-500">Загрузка...</div>;
  }

  if (posts.length === 0) {
    return <div className="text-center py-10 text-slate-500">Постов пока нет</div>;
  }

  return (
    <>
      {posts.map((post) => {
        const postId = getPostId(post);
        const localizedTitle = getLocalizedTextValue(getTranslatedField(post.title, post.translations, 'title'), activeLanguage);
        const localizedContent = getLocalizedTextValue(getTranslatedField(post.content || '', post.translations, 'content'), activeLanguage);
        const preview = getPostPreview(localizedContent || '');
        return (
          <Card key={postId || `${post.title}_${post.createdAt}`} className="group">
            <div className="flex gap-4">
              <label className="pt-1">
                <input
                  type="checkbox"
                  checked={Boolean(postId && selectedPostIdsSet.has(postId))}
                  onChange={() => onTogglePostSelection(postId)}
                  disabled={!postId}
                  className="h-4 w-4 rounded border-white/20 bg-slate-900"
                  aria-label="Отметить пост"
                />
              </label>
              {post.mediaUrl && (
                <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-slate-800">
                  <AdminNewsMediaPreview mediaUrl={post.mediaUrl} title={localizedTitle} compact />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <h4 className="font-semibold text-white break-words">{localizedTitle}</h4>
                    <p className="mt-1 text-sm text-slate-400 break-all">{preview}</p>
                  </div>
                  <Badge variant={post.status === 'published' ? 'success' : post.status === 'scheduled' ? 'info' : 'warning'}>
                    {post.status === 'published' ? 'Опубликован' : post.status === 'scheduled' ? 'Запланирован' : 'Черновик'}
                  </Badge>
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <div className="flex gap-4 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <Clock size={12} />
                      {post.createdAt ? new Date(post.createdAt).toLocaleDateString() : '—'}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    {post.status !== 'published' && (
                      <button
                        onClick={() => onPublish(postId)}
                        disabled={!postId}
                        className="text-xs font-semibold text-emerald-400 hover:underline"
                      >
                        Опубликовать
                      </button>
                    )}
                    <button
                      onClick={() => onEdit(post)}
                      disabled={!postId}
                      className="text-xs font-semibold text-slate-400 hover:text-white"
                    >
                      Изменить
                    </button>
                    <button
                      onClick={() => onDelete(postId)}
                      disabled={!postId}
                      className="rounded-lg border border-rose-500/40 px-2 py-1 text-xs font-semibold text-rose-300 hover:bg-rose-500/10"
                    >
                      Удалить
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        );
      })}
    </>
  );
}
