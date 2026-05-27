import { motion } from 'framer-motion';
import { HandHeart } from 'lucide-react';
import { formatUserK } from '@/utils/formatters';
import { getWishPreview } from './wishUtils';
import type { Wish, WishScope } from './types';

function statusClass(status: Wish['status']) {
  return status === 'open'
    ? 'text-blue-400 bg-blue-400/10'
    : status === 'pending'
      ? 'text-amber-400 bg-amber-400/10'
      : 'text-emerald-400 bg-emerald-400/10';
}

function statusLabel(status: Wish['status'], t: (key: string) => string) {
  return status === 'open'
    ? t('galaxy.status.open')
    : status === 'pending'
      ? t('galaxy.status.pending')
      : t('galaxy.status.fulfilled');
}

function WishMeta({
  supportK,
  supports,
}: {
  supportK: number;
  supports: number;
}) {
  return (
    <div className="flex items-center gap-3 text-tiny text-neutral-400 font-bold uppercase tracking-widest border-b border-white/5 pb-3">
      <div className="flex items-center gap-1.5">
        <HandHeart className="h-4 w-4 text-amber-300" /> {supports}
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-blue-400">✨</span> {formatUserK(supportK)} K
      </div>
    </div>
  );
}

export function GalaxyWishList({
  isLandscape,
  isWishEditable,
  loadingMoreWishes,
  onEditWish,
  onFulfillWish,
  onLoadMore,
  onMarkFulfilled,
  onSelectWish,
  onSupportWish,
  scope,
  t,
  wishHasMore,
  wishes,
}: {
  isLandscape: boolean;
  isWishEditable: (wish: Wish) => boolean;
  loadingMoreWishes: WishScope | null;
  onEditWish: (wish: Wish) => void;
  onFulfillWish: (wish: Wish) => void;
  onLoadMore: (scope: WishScope) => void;
  onMarkFulfilled: (wish: Wish) => void;
  onSelectWish: (wish: Wish) => void;
  onSupportWish: (wish: Wish) => void;
  scope: WishScope;
  t: (key: string) => string;
  wishHasMore: boolean;
  wishes: Wish[];
}) {
  const isMine = scope === 'mine';

  return (
    <motion.div
      key={scope}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={`grid gap-3 lg:gap-4 ${isLandscape ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1'}`}
    >
      {isMine && wishes.length === 0 ? (
        <div className="col-span-full text-center py-20">
          <div className="text-6xl mb-6">🌠</div>
          <p className="text-h2 text-neutral-400 uppercase tracking-widest">{t('galaxy.mine.empty_title')}</p>
          <p className="text-body text-neutral-600 mt-4">{t('galaxy.mine.empty_desc')}</p>
        </div>
      ) : (
        wishes.map((wish, index) => (
          <motion.div
            key={wish.id}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.05 }}
            className={`group relative flex min-h-[260px] flex-col bg-neutral-900/50 backdrop-blur-xl rounded-xl lg:rounded-2xl p-4 lg:p-5 shadow-xl hover:-translate-y-1 transition-all overflow-hidden ${isMine
              ? 'border border-emerald-500/20 hover:border-emerald-500/40'
              : 'border border-white/10 hover:border-white/20'
              }`}
          >
            <div className={`absolute -top-12 -right-6 w-32 h-32 rounded-full opacity-80 transition-all group-hover:scale-110 pointer-events-none ${isMine
              ? 'bg-gradient-to-br from-emerald-500/10 via-blue-500/10 to-transparent blur-2xl'
              : 'bg-gradient-to-br from-blue-500/10 via-purple-500/10 to-transparent blur-2xl'
              }`} />
            <div className="absolute inset-0 opacity-0 group-hover:opacity-20 transition-opacity bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.08),transparent_40%)] pointer-events-none" />
            <div className="flex items-center justify-between mb-4">
              <span className="text-tiny font-mono text-neutral-500 uppercase tracking-widest">
                {wish.date}
              </span>
              <span className={`text-tiny font-bold uppercase tracking-widest px-2 py-1 rounded-md ${statusClass(wish.status)}`}>
                {statusLabel(wish.status, t)}
              </span>
            </div>

            <p
              className="text-secondary text-neutral-200 leading-relaxed mb-6 flex-1 italic cursor-pointer"
              data-no-translate
              onClick={() => onSelectWish(wish)}
            >
              &quot;{getWishPreview(wish.text)}&quot;
            </p>

            <div className="space-y-3">
              <WishMeta supportK={wish.supportK} supports={wish.supports} />

              {isMine ? (
                <>
                  {wish.status === 'pending' && (
                    <button
                      type="button"
                      onClick={() => onMarkFulfilled(wish)}
                      className="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-green-600 rounded-lg text-tiny font-bold uppercase tracking-widest hover:scale-[1.02] transition-all shadow-lg shadow-emerald-600/20 cursor-pointer"
                    >
                      {t('galaxy.mine.mark_fulfilled_btn')}
                    </button>
                  )}
                  {isWishEditable(wish) && (
                    <button
                      type="button"
                      onClick={() => onEditWish(wish)}
                      className="w-full py-2.5 bg-white/5 border border-white/10 rounded-lg text-tiny font-bold uppercase tracking-widest hover:bg-white/10 transition-all cursor-pointer"
                    >
                      {t('common.edit')}
                    </button>
                  )}
                </>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => onSupportWish(wish)}
                    className="py-2 bg-white/5 border border-white/10 rounded-lg text-tiny font-bold uppercase tracking-widest hover:bg-white/10 transition-all cursor-pointer"
                  >
                    {t('galaxy.actions.support')}
                  </button>
                  <button
                    type="button"
                    onClick={() => onFulfillWish(wish)}
                    className="py-2 bg-blue-600/10 border border-blue-600/20 text-blue-400 rounded-lg text-tiny font-bold uppercase tracking-widest hover:bg-blue-600/20 transition-all cursor-pointer"
                  >
                    {t('galaxy.actions.fulfill')}
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        ))
      )}

      {wishes.length > 0 && (
        <div className="col-span-full">
          <button
            type="button"
            onClick={() => onLoadMore(scope)}
            disabled={!wishHasMore || loadingMoreWishes === scope}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-tiny font-bold uppercase tracking-widest text-neutral-200 transition-all hover:bg-white/10 disabled:opacity-45"
          >
            {loadingMoreWishes === scope ? t('common.loading') : wishHasMore ? t('bridges.show_more') : t('bridges.all_shown')}
          </button>
        </div>
      )}
    </motion.div>
  );
}
