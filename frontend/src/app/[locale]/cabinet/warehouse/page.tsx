'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost } from '@/utils/api';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/context/AuthContext';
import { PageTitle } from '@/components/PageTitle';
import { Package } from 'lucide-react';
import { useI18n } from '@/context/I18nContext';
import { formatDateTime, formatNumber } from '@/utils/formatters';

type WarehouseUsageEffect = {
  unit?: 'percent' | 'lm' | string;
  sign?: '+' | '-' | string;
  baseValue?: number;
  boostedValue?: number;
  activeValue?: number;
  bonusValue?: number;
  adBoosted?: boolean;
};

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
  usageEffect?: WarehouseUsageEffect | null;
};

export default function CabinetWarehousePage() {
  const toast = useToast();
  const { refreshUser } = useAuth();
  const { language, t } = useI18n();

  const [items, setItems] = useState<WarehouseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingId, setUsingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const data = await apiGet<{ items: WarehouseItem[] }>('/warehouse');
    setItems(data.items || []);
  }, []);

  useEffect(() => {
    setLoading(true);
    load()
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : '';
        toast.error(t('common.error'), message || t('cabinet.warehouse_load_error'));
      })
      .finally(() => setLoading(false));
  }, [load, toast, t]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ offerType?: string }>).detail;
      if (detail?.offerType !== 'warehouse_item_upgrade') return;
      load().catch(() => {});
    };
    window.addEventListener('givkoin:ad-boost-completed', handler);
    return () => window.removeEventListener('givkoin:ad-boost-completed', handler);
  }, [load]);

  const formatEffectValue = (effect: WarehouseUsageEffect, value: number) => {
    const safeValue = Number(value) || 0;
    const sign = String(effect.sign || '');
    if (effect.unit === 'percent') return `${sign}${formatNumber(safeValue, language)}%`;
    if (effect.unit === 'lm') return `${sign}${formatNumber(safeValue, language)} Lm`;
    return `${sign}${formatNumber(safeValue, language)}`;
  };

  const getEffectText = (effect?: WarehouseUsageEffect | null) => {
    if (!effect) return '';
    const baseValue = Number(effect.baseValue);
    const activeValue = Number(effect.activeValue);
    const effectValue = Number.isFinite(baseValue) ? baseValue : activeValue;
    if (!Number.isFinite(effectValue)) return '';
    const parts = [`${t('cabinet.effect')}: ${formatEffectValue(effect, effectValue)}`];
    const bonusValue = Number(effect.bonusValue);
    const boostedValue = Number(effect.boostedValue);
    if (effect.adBoosted && Number.isFinite(bonusValue) && bonusValue > 0) {
      parts.push(`${t('cabinet.bonus')}: ${formatEffectValue(effect, bonusValue)}`);
    }
    if (effect.adBoosted && Number.isFinite(boostedValue)) {
      parts.push(`${t('cabinet.total')}: ${formatEffectValue(effect, boostedValue)}`);
    }
    return parts.join(' • ');
  };

  const handleUseItem = async (id: string) => {
    setUsingId(id);
    try {
      const res = await apiPost<{ ok: boolean; message?: string }>('/warehouse/use', { itemId: id });
      toast.success(t('common.done'), res?.message || t('cabinet.item_used'));
      await Promise.all([load().catch(() => {}), refreshUser().catch(() => {})]);
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
                  const effectText = getEffectText(it.usageEffect);
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
                          {effectText && (
                            <div className="text-caption text-amber-100/80 mt-1">
                              {effectText}
                            </div>
                          )}
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

