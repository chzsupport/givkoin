'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AdaptiveAdWrapper } from '@/components/AdaptiveAdWrapper';
import { apiGet, apiPost } from '@/utils/api';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/context/AuthContext';
import { ShoppingBag } from 'lucide-react';
import { formatUserSc } from '@/utils/formatters';
import { PageTitle } from '@/components/PageTitle';
import { StickySideAdRail } from '@/components/StickySideAdRail';
import { getResponsiveSideAdSlot } from '@/utils/sideAdSlot';
import { useI18n } from '@/context/I18nContext';

type ShopItem = {
  key: string;
  category: 'entity' | 'boost';
  title: string;
  description?: string;
  priceSc: number;
};

export default function ShopPage() {
  const toast = useToast();
  const { t, localePath } = useI18n();
  const { user, refreshUser } = useAuth();
  const [windowWidth, setWindowWidth] = useState(0);
  const sideAdSlot = getResponsiveSideAdSlot(windowWidth, typeof window !== 'undefined' ? window.innerHeight : 0);
  const isDesktop = Boolean(sideAdSlot);
  const [activeTab, setActiveTab] = useState<'entity' | 'boost'>('entity');
  const [items, setItems] = useState<ShopItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [buyingKey, setBuyingKey] = useState<string | null>(null);



  useEffect(() => {
    const updateLayout = () => {
      const w = window.innerWidth;
      setWindowWidth(w);
    };

    updateLayout();
    window.addEventListener('resize', updateLayout);
    return () => window.removeEventListener('resize', updateLayout);
  }, []);

  const loadCatalog = async () => {
    const data = await apiGet<{ items: ShopItem[] }>('/shop/catalog');
    setItems(data.items || []);
  };

  useEffect(() => {
    setLoading(true);
    loadCatalog()
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : '';
        toast.error(t('common.error'), message || t('shop.failed_load'));
      })
      .finally(() => setLoading(false));
  }, [t, toast]);

  const buy = async (itemKey: string) => {
    setBuyingKey(itemKey);
    try {
      await apiPost('/shop/buy', { itemKey });
      toast.success(t('shop.purchased_title'), t('shop.purchased_desc'));
      await Promise.all([refreshUser().catch(() => { }), loadCatalog().catch(() => { })]);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : '';
      toast.error(t('common.error'), message || t('shop.failed_buy'));
    } finally {
      setBuyingKey(null);
    }
  };

  const filtered = items.filter((x) => x.category === activeTab);

  return (
    <div
      className={`flex-1 flex flex-col min-h-0 ${windowWidth >= 768 ? 'overflow-hidden' : 'overflow-y-auto'} bg-[#050510] text-slate-200 font-sans selection:bg-violet-500/30`}
    >
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-violet-900/20 via-[#050510] to-[#050510]" />
        <div className="absolute top-1/4 right-1/4 h-64 w-64 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="absolute bottom-1/3 left-1/4 h-48 w-48 rounded-full bg-purple-500/10 blur-3xl" />
      </div>

      <div className="relative z-10 flex flex-1 min-h-0">
        <StickySideAdRail adSlot={sideAdSlot} page="shop" placement="shop_sidebar_left" />

        <div className="flex-1 flex flex-col min-w-0 px-3 lg:px-4 py-2 lg:py-3 min-h-0">
          <div className={`${isDesktop ? 'hidden' : 'flex'} mx-auto mb-6 shrink-0 justify-center w-full`}>
            <AdaptiveAdWrapper
              page="shop"
              placement="shop_header"
              strategy="mobile_tablet_adaptive"
            />
          </div>

          <header className="flex flex-col gap-2 mb-4 flex-shrink-0">
            <div className="flex items-center justify-between gap-3">
              <Link
                href={localePath('/tree')}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-white/5 border border-white/10 rounded-lg font-bold uppercase tracking-widest text-tiny hover:bg-white/10 transition-all active:scale-95 group backdrop-blur-md"
              >
                <span className="group-hover:-translate-x-1 transition-transform">←</span> {t('shop.to_tree')}
              </Link>

              <Link
                href={localePath('/cabinet/warehouse')}
                className="hidden sm:flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-tiny text-white/70 hover:bg-white/10 transition-colors"
              >
                <span>📦</span>
                <span>{t('shop.warehouse')}</span>
              </Link>
            </div>

            <PageTitle
              title={t('shop.title')}
              Icon={ShoppingBag}
              gradientClassName="from-violet-200 via-violet-400 to-purple-500"
              iconClassName="w-4 h-4 xl:w-5 xl:h-5 text-violet-300"
            />
          </header>

          <div className="flex-1 min-h-0">
            <div className="page-content-wide">
              <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-4 mb-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
                      <ShoppingBag className="w-5 h-5 text-violet-300" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-white">{t('shop.buy_items_title')}</div>
                      <div className="text-xs text-white/60">{t('shop.buy_items_desc')}</div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3">
                    <div className="text-xs text-white/60">K: <span className="text-white font-bold">{formatUserSc(user?.sc ?? 0)}</span></div>
                    <Link
                      href={localePath('/cabinet/warehouse')}
                      className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-tiny font-bold text-amber-200 hover:bg-amber-500/20 transition-colors"
                    >
                      {t('shop.open_warehouse')}
                    </Link>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-center gap-2 mb-4">
                <button
                  onClick={() => setActiveTab('entity')}
                  className={`px-4 py-2 rounded-full border text-sm font-medium transition-all ${activeTab === 'entity'
                    ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-200'
                    : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'}
                  `}
                >
                  {t('shop.tabs.entity')}
                </button>
                <button
                  onClick={() => setActiveTab('boost')}
                  className={`px-4 py-2 rounded-full border text-sm font-medium transition-all ${activeTab === 'boost'
                    ? 'border-violet-500/50 bg-violet-500/10 text-violet-200'
                    : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'}
                  `}
                >
                  {t('shop.tabs.boost')}
                </button>
              </div>

              {loading ? (
                <div className="rounded-2xl border border-white/10 bg-black/20 p-6 text-white/60">{t('common.loading')}</div>
              ) : filtered.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-black/20 p-6 text-white/60">{t('shop.empty')}</div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {filtered.map((it) => {
                    const isBuying = buyingKey === it.key;
                    return (
                      <div
                        key={it.key}
                        className="rounded-2xl border border-white/10 bg-black/20 backdrop-blur-md p-4 flex flex-col"
                      >
                        <div className="text-sm font-bold text-white">{it.title}</div>
                        {it.description && <div className="text-xs text-white/60 mt-1 flex-1">{it.description}</div>}
                        <div className="flex items-center justify-between mt-4 gap-3">
                          <div className="text-xs text-white/60">{t('shop.price')}: <span className="text-white font-bold">{it.priceSc}</span> K</div>
                          <button
                            onClick={() => buy(it.key)}
                            disabled={isBuying}
                            className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-tiny font-bold text-amber-200 hover:bg-amber-500/20 transition-colors disabled:opacity-60"
                          >
                            {isBuying ? '...' : t('shop.buy')}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <StickySideAdRail adSlot={sideAdSlot} page="shop" placement="shop_sidebar_right" />
      </div>
    </div>
  );
}

