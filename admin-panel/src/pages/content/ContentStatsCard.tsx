import { Card } from '../../components/ui';
import type { AdminPost } from './contentTypes';

export function ContentStatsCard({ posts }: { posts: AdminPost[] }) {
  const publishedCount = posts.filter(p => p.status === 'published').length;
  const draftCount = posts.filter(p => p.status === 'draft').length;

  return (
    <Card title="Статистика контента">
      <div className="space-y-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-400">Всего постов</span>
          <span className="font-semibold text-white">{posts.length}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-400">Опубликовано</span>
          <span className="font-semibold text-emerald-400">{publishedCount}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-400">В черновиках</span>
          <span className="font-semibold text-amber-400">{draftCount}</span>
        </div>
      </div>
    </Card>
  );
}
