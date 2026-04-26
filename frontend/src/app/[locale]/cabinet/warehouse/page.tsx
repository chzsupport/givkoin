'use client';

import { useEffect, useState } from 'react';
import { apiGet, apiPost } from '@/utils/api';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/context/AuthContext';
import { PageTitle } from '@/components/PageTitle';
import { Package } from 'lucide-react';
import { useI18n } from '@/context/I18nContext';
import { useBoost } from '@/context/BoostContext';
import { formatDateTime } from '@/utils/formatters';

type WarehouseItem = {
  _id: string;
  itemKey: string;
  category: 'entity' | 'boost';
  title: string;
  description?: string;
  priceSc: number;
  status: 'stored' | 'used';
  purchasedAt?: string;
  usedAt?: string;
};

export default function CabinetWarehousePage() {
  const toast = useToast();
  const { refreshUser } = useAuth();
  const { language, t } = useI18n();
  const boost = useBoost();

  const [items, setItems] = useState<WarehouseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingId, setUsingId] = useState<string | null>(null);

  const load = async () => {
    const data = await apiGet<{ items: WarehouseItem[] }>('/warehouse');
    setItems(data.items || []);
  };

  useEffect(() => {
    setLoading(true);
    load()
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : '';
        toast.error(t('common.error'), message || t('cabinet.warehouse_load_error'));
      })
      .finally(() => setLoading(false));
  }, [toast, t]);

  const handleUseItem = async (id: string) => {
    setUsingId(id);
    try {
      const res = await apiPost<{ ok: boolean; message?: string }>('/warehouse/use', { itemId: id });
      toast.success(t('common.done'), res?.message || t('cabinet.item_used'));
      await Promise.all([load().catch(() => {}), refreshUser().catch(() => {})]);

      // Boost: enhance item effect by 5%
      boost.offerBoost({
        type: 'inventory_enhance',
        label: t('boost.inventory_enhance.label'),
        description: t('boost.inventory_enhance.description'),
        rewardText: t('boost.inventory_enhance.reward'),
        onReward: () => {
          apiPost('/boost/claim', { type: 'inventory_enhance' }).then((res) => {
            const data = res as { ok?: boolean } | null;
            if (data?.ok) refreshUser();
          }).catch(() => {});
        },
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : '';
      toast.error(t('common.error'), message || t('cabinet.item_use_error'));
    } finally {
      setUsingId(null);
    }
  };

  return (
    <div className="relative w-full">
      <div className="relative z-10 px-6 py-8">
        <div className="space-y-6">
          <div className="text-center">
            <PageTitle
              title={t('cabinet.warehouse')}
              Icon={Package}
              gradientClassName="from-white via-slate-200 to-amber-200"
              iconClassName="w-4 h-4 xl:w-5 xl:h-5 text-amber-200"
              size="h3"
              className="w-fit mx-auto"
            />
            <p className="text-tiny text-white/50 mt-1">{t('cabinet.warehouse_desc')}</p>
          </div>

          {loading ? (
            <div className="rounded-2xl border border-white/10 bg-black/20 p-6 text-white/60">{t('common.loading')}</div>
          ) : items.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-black/20 p-6 text-white/60">{t('cabinet.warehouse_empty')}</div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-black/20 backdrop-blur-md overflow-hidden">
              <div className="divide-y divide-white/5">
                {items.map((it) => {
                  const isStored = it.status === 'stored';
                  const isUsing = usingId === it._id;
                  return (
                    <div key={it._id} className="px-5 py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <div className="text-sm font-bold text-white break-words">{it.title}</div>
                            <span className={`text-caption px-2 py-0.5 rounded-full border ${it.category === 'entity' ? 'border-emerald-500/30 text-emerald-200 bg-emerald-500/10' : 'border-violet-500/30 text-violet-200 bg-violet-500/10'}`}>
                              {it.category === 'entity' ? t('landing.entity') : t('cabinet.boost')}
                            </span>
                          </div>
                          {it.description && <div className="text-xs text-white/60 mt-1 break-words">{it.description}</div>}
                          <div className="text-caption text-white/30 mt-2">
                            {t('cabinet.purchased')}: {it.purchasedAt ? formatDateTime(it.purchasedAt, language) : '—'}
                            {it.usedAt ? ` • ${t('cabinet.used')}: ${formatDateTime(it.usedAt, language)}` : ''}
                          </div>
                        </div>

                        <div className="shrink-0 flex items-center gap-2">
                          {isStored ? (
                            <button
                              onClick={() => handleUseItem(it._id)}
                              disabled={isUsing}
                              className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-tiny font-bold text-amber-200 hover:bg-amber-500/20 transition-colors disabled:opacity-60"
                            >
                              {isUsing ? '...' : t('cabinet.use_item')}
                            </button>
                          ) : (
                            <div className="text-xs text-white/40">{t('cabinet.used')}</div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

