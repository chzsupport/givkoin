'use client';

import { useMemo, useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PageBackground } from '@/components/PageBackground';
import Link from 'next/link';
import { apiGet, apiPost } from '@/utils/api';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { AdaptiveAdWrapper } from '@/components/AdaptiveAdWrapper';
import { formatUserK } from '@/utils/formatters';
import { Sparkles } from 'lucide-react';
import { PageTitle } from '@/components/PageTitle';
import { StickySideAdRail } from '@/components/StickySideAdRail';
import { getResponsiveSideAdSlot } from '@/utils/sideAdSlot';
import { useI18n } from '@/context/I18nContext';

type WishStatus = 'open' | 'pending' | 'fulfilled';

type WishDto = {
  id: string;
  text: string;
  status: WishStatus | 'supported' | 'archived';
  supportCount: number;
  supportK: number;
  authorId: string | null;
  executorId: string | null;
  createdAt: string;
  takenAt?: string | null;
  fulfilledAt?: string | null;
};

type Wish = {
  id: string;
  text: string;
  date: string;
  supports: number;
  supportK: number;
  status: WishStatus;
  isMine: boolean;
};

const MAX_CHARS = 1000;
const COST_PER_WISH = 100;
const DAILY_WISH_LIMIT = 3;
const DAILY_FULFILL_LIMIT = 3;
const MONTHLY_FULFILL_LIMIT = 10;
const FULFILL_REWARD = 100;

export default function GalaxyPage() {
  const { user, refreshUser } = useAuth();
  const toast = useToast();
  const { t, localePath } = useI18n();

  const [activeTab, setActiveTab] = useState<'create' | 'others' | 'mine'>('others');
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [wishText, setWishText] = useState('');
  const [createdToday, setCreatedToday] = useState(0);
  const [sending, setSending] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [launchId, setLaunchId] = useState<number | null>(null);
  const [windowWidth, setWindowWidth] = useState(0);
  const [isLandscape, setIsLandscape] = useState(false);
  const sideAdSlot = getResponsiveSideAdSlot(windowWidth, typeof window !== 'undefined' ? window.innerHeight : 0);
  const isDesktop = Boolean(sideAdSlot);
  const [isWishTabsSplit, setIsWishTabsSplit] = useState(false);
  const wishTabsWrapRef = useRef<HTMLDivElement | null>(null);
  const wishTabOthersRef = useRef<HTMLButtonElement | null>(null);
  const wishTabMineRef = useRef<HTMLButtonElement | null>(null);
  const wishTabCreateRef = useRef<HTMLButtonElement | null>(null);

  // Support Modal State
  const [supportModalWish, setSupportModalWish] = useState<Wish | null>(null);
  const [supportAmount, setSupportAmount] = useState<string>('');

  // Fulfill Modal State
  const [fulfillModalWish, setFulfillModalWish] = useState<Wish | null>(null);
  const [contactInfo, setContactInfo] = useState('');

  // Mark Fulfilled Modal State
  const [markFulfilledWish, setMarkFulfilledWish] = useState<Wish | null>(null);

  // Support Confirmation Modal
  const [showSupportConfirm, setShowSupportConfirm] = useState(false);

  // Fulfillment limits (приходит с сервера)
  const [fulfilledToday, setFulfilledToday] = useState(0);
  const [fulfilledThisMonth, setFulfilledThisMonth] = useState(0);

  const userK = user?.k ?? 0;



  const canCreate = useMemo(
    () => wishText.trim().length > 0 && wishText.trim().length <= MAX_CHARS && createdToday < DAILY_WISH_LIMIT && userK >= COST_PER_WISH,
    [wishText, createdToday, userK],
  );

  function mapDtoToWish(dto: WishDto, currentUserId?: string | null): Wish {
    const created = dto.createdAt ? new Date(dto.createdAt) : new Date();
    const date = created.toLocaleDateString();
    const normalizedStatus: WishStatus = dto.status === 'pending'
      ? 'pending'
      : dto.status === 'fulfilled'
        ? 'fulfilled'
        : 'open';
    return {
      id: dto.id,
      text: dto.text,
      date,
      supports: dto.supportCount || 0,
      supportK: dto.supportK || 0,
      status: normalizedStatus,
      isMine: !!currentUserId && dto.authorId === currentUserId,
    };
  }

  async function loadAll() {
    if (!user) return;
    try {
      const [othersRes, mineRes, stats] = await Promise.all([
        apiGet<{ wishes: WishDto[] }>('/wishes?scope=others'),
        apiGet<{ wishes: WishDto[] }>('/wishes?scope=mine'),
        apiGet<{ createdToday: number; executedToday: number; executedLast30: number; userK?: number }>('/wishes/stats'),
      ]);

      const mappedOthers = (othersRes.wishes || []).map((w) => mapDtoToWish(w, user._id));
      const mappedMine = (mineRes.wishes || []).map((w) => mapDtoToWish(w, user._id));

      setWishes([...mappedMine, ...mappedOthers]);
      setCreatedToday(stats.createdToday ?? 0);
      setFulfilledToday(stats.executedToday ?? 0);
      setFulfilledThisMonth(stats.executedLast30 ?? 0);

      // Refresh global user state to get latest K
      refreshUser();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Failed to load wishes', e);
    }
  }

  useEffect(() => {
    if (user?._id) {
      loadAll();
    }

    const updateLayout = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setWindowWidth(w);
      const isLand = w > h;
      setIsLandscape(isLand);
    };

    updateLayout();
    window.addEventListener('resize', updateLayout);

    return () => {
      window.removeEventListener('resize', updateLayout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?._id]);

  useEffect(() => {
    const wrap = wishTabsWrapRef.current;
    const tabOthers = wishTabOthersRef.current;
    const tabMine = wishTabMineRef.current;
    const tabCreate = wishTabCreateRef.current;
    if (!wrap || !tabOthers || !tabMine || !tabCreate) return;

    const GAP = 6; // Tailwind gap-1.5
    const PADDING_AND_BORDER = 12;
    const recompute = () => {
      const containerWidth = wrap.clientWidth;
      const allTabsWidth =
        tabOthers.offsetWidth +
        tabMine.offsetWidth +
        tabCreate.offsetWidth +
        GAP * 2 +
        PADDING_AND_BORDER;
      const firstRowWidth = tabOthers.offsetWidth + tabMine.offsetWidth + GAP + PADDING_AND_BORDER;
      const shouldSplit = containerWidth < allTabsWidth && containerWidth >= firstRowWidth;
      setIsWishTabsSplit(shouldSplit);
    };

    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(wrap);
    ro.observe(tabOthers);
    ro.observe(tabMine);
    ro.observe(tabCreate);
    window.addEventListener('resize', recompute);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', recompute);
    };
  }, [wishes.length]);

  const floatingOrbs = useMemo(
    () =>
      Array.from({ length: 10 }).map((_, idx) => ({
        id: idx,
        size: 80 + Math.random() * 120,
        top: `${5 + Math.random() * 70}%`,
        left: `${Math.random() * 100}%`,
        duration: 12 + Math.random() * 10,
        delay: Math.random() * 4,
        gradient:
          idx % 2 === 0
            ? 'radial-gradient(circle at 30% 30%, rgba(139, 92, 246, 0.45), rgba(59, 130, 246, 0.05))'
            : 'radial-gradient(circle at 70% 70%, rgba(56, 189, 248, 0.35), rgba(168, 85, 247, 0.05))',
      })),
    [],
  );

  const handleCreate = async () => {
    if (!canCreate || sending || !user) return;
    setSending(true);
    try {
      const res = await apiPost<{ wish: WishDto; user: unknown; stats: { createdToday: number } }>('/wishes', {
        text: wishText.trim(),
      });

      const newWish = mapDtoToWish(res.wish, user._id);
      setWishes(prev => [newWish, ...prev]);
      setCreatedToday(res.stats?.createdToday ?? createdToday + 1);
      setWishText('');
      setShowSuccess(true);
      const launchKey = Date.now();
      setLaunchId(launchKey);
      setTimeout(() => setShowSuccess(false), 3000);
      setTimeout(() => setLaunchId(null), 1600);

      // Refresh user data in background
      refreshUser();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('create wish failed', e);
    } finally {
      setSending(false);
    }
  };

  const handleSupportConfirm = () => {
    if (!supportModalWish || !supportAmount) return;
    const amount = parseInt(supportAmount);
    if (Number.isNaN(amount) || amount <= 0 || amount > userK) return;
    setShowSupportConfirm(true);
  };

  const handleSupport = async () => {
    if (!supportModalWish || !supportAmount || !user) return;
    const amount = parseInt(supportAmount);
    if (Number.isNaN(amount) || amount <= 0 || amount > userK) return;

    try {
      const res = await apiPost<{ wish: WishDto; user: unknown; stats: { createdToday: number; executedToday: number; executedLast30: number } }>(
        `/wishes/${supportModalWish.id}/support`,
        { amount },
      );

      const updatedWish = mapDtoToWish(res.wish, user._id);
      setWishes(prev => prev.map(w => (w.id === updatedWish.id ? updatedWish : w)));
      refreshUser();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('support wish failed', e);
    } finally {
      setShowSupportConfirm(false);
      setSupportModalWish(null);
      setSupportAmount('');
    }
  };

  const handleFulfill = async () => {
    if (!fulfillModalWish || !contactInfo || !user) return;

    if (fulfilledToday >= DAILY_FULFILL_LIMIT) {
      toast.error(t('galaxy.limit_title'), `${t('galaxy.limit_fulfill_today_prefix')} ${DAILY_FULFILL_LIMIT}). ${t('galaxy.try_tomorrow')}`);
      return;
    }
    if (fulfilledThisMonth >= MONTHLY_FULFILL_LIMIT) {
      toast.error(t('galaxy.limit_title'), `${t('galaxy.limit_fulfill_month_prefix')} ${MONTHLY_FULFILL_LIMIT}). ${t('galaxy.try_next_month')}`);
      return;
    }

    try {
      const res = await apiPost<{ wish: WishDto; stats: { executedToday: number; executedLast30: number } }>(
        `/wishes/${fulfillModalWish.id}/fulfill`,
        { contact: contactInfo.trim() },
      );
      const updatedWish = mapDtoToWish(res.wish, user._id);
      setWishes(prev => prev.map(w => (w.id === updatedWish.id ? updatedWish : w)));
      setFulfilledToday(res.stats?.executedToday ?? fulfilledToday);
      setFulfilledThisMonth(res.stats?.executedLast30 ?? fulfilledThisMonth);
      refreshUser();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('take for fulfillment failed', e);
    } finally {
      setFulfillModalWish(null);
      setContactInfo('');
    }
  };

  const handleMarkFulfilled = async () => {
    if (!markFulfilledWish || !user) return;
    try {
      const res = await apiPost<{ wish: WishDto; stats: { createdToday: number; executedToday: number; executedLast30: number } }>(
        `/wishes/${markFulfilledWish.id}/mark-fulfilled`,
        {},
      );
      const updatedWish = mapDtoToWish(res.wish, user._id);
      setWishes(prev => prev.map(w => (w.id === updatedWish.id ? updatedWish : w)));
      refreshUser();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('mark fulfilled failed', e);
    } finally {
      setMarkFulfilledWish(null);
    }
  };

  return (
    <div className={`flex-1 flex flex-col min-h-0 ${isLandscape && windowWidth >= 1024 ? 'lg:overflow-hidden' : 'overflow-y-auto'} text-slate-200 font-sans selection:bg-yellow-500/30`}>
      <PageBackground />

      {/* Space Overlay */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute -top-10 -left-10 w-[32rem] h-[32rem] bg-gradient-to-br from-blue-500/20 via-purple-500/15 to-transparent blur-[150px] rounded-full animate-pulse" />
        <div className="absolute bottom-0 right-[-6rem] w-[36rem] h-[36rem] bg-gradient-to-br from-indigo-500/20 via-cyan-400/15 to-transparent blur-[150px] rounded-full animate-pulse" style={{ animationDelay: '2s' }} />
        <div className="absolute inset-0 opacity-30">
          {floatingOrbs.map((orb) => (
            <motion.div
              key={orb.id}
              className="absolute rounded-full"
              style={{ width: orb.size, height: orb.size, top: orb.top, left: orb.left, background: orb.gradient, filter: 'blur(14px)' }}
              animate={{ y: [-20, 30, -10], opacity: [0.2, 0.65, 0.35], rotate: [0, 6, -4, 0] }}
              transition={{ duration: orb.duration, repeat: Infinity, delay: orb.delay, ease: 'easeInOut' }}
            />
          ))}
        </div>
      </div>

      {/* Основной контейнер с рекламными блоками */}
      <div className="relative z-10 flex flex-1 min-h-0">
        {/* Левый рекламный блок - Show only in landscape on large screens */}
        <StickySideAdRail adSlot={sideAdSlot} page="galaxy" placement="galaxy_sidebar_left" />

        {/* Центральный контент */}
        <div className="flex-1 flex flex-col min-w-0 px-3 lg:px-4 py-2 lg:py-3 min-h-0">

          {/* MOBILE AD BLOCK - Dynamic sizes for Tablets/Mobile. Hidden in landscape on large screens */}
          <div className={`${isDesktop ? 'hidden' : 'flex'} mx-auto mb-6 shrink-0 justify-center w-full`}>
            <AdaptiveAdWrapper
              page="galaxy"
              placement="galaxy_header"
              strategy="mobile_tablet_adaptive"
            />
          </div>

          {/* Header Row */}
          <header className="flex flex-col gap-2 mb-4 shrink-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex-shrink-0">
                <Link
                  href={localePath('/tree')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-white/5 border border-white/10 rounded-lg font-bold uppercase tracking-widest text-tiny hover:bg-white/10 transition-all active:scale-95 group backdrop-blur-md"
                >
                  <span className="group-hover:-translate-x-1 transition-transform">←</span> {t('nav.to_tree')}
                </Link>
              </div>

              <div className="flex flex-1 basis-[18rem] min-w-0 justify-center sm:justify-end">
                <div className="flex items-stretch gap-1.5 sm:gap-0 bg-white/5 border border-white/10 rounded-2xl p-1 backdrop-blur-xl shadow-2xl shadow-blue-900/20 max-w-full">
                  <div className="flex-1 flex flex-col items-center justify-center px-2.5 lg:px-3 py-2 rounded-xl hover:bg-white/5 transition-colors">
                    <span className="text-tiny uppercase tracking-[0.2em] text-neutral-500 font-black mb-0.5 whitespace-nowrap">{t('galaxy.balance')}</span>
                    <div className="flex items-center gap-1">
                      <span className="text-secondary font-mono font-black text-blue-300">{userK.toLocaleString()}</span>
                      <span className="text-tiny font-bold text-blue-500/50 uppercase">K</span>
                    </div>
                  </div>

                  <div className="hidden sm:block w-px my-2 bg-gradient-to-b from-transparent via-white/10 to-transparent" />

                  <div className="flex-1 flex flex-col items-center justify-center px-2.5 lg:px-3 py-2 rounded-xl hover:bg-white/5 transition-colors">
                    <span className="text-tiny uppercase tracking-[0.2em] text-neutral-500 font-black mb-0.5 whitespace-nowrap">{t('galaxy.wishes')}</span>
                    <div className="flex items-center gap-1">
                      <span className="text-secondary font-mono font-black text-purple-300">{createdToday}</span>
                      <span className="text-tiny font-bold text-purple-500/30">/</span>
                      <span className="text-tiny font-bold text-purple-500/50">{DAILY_WISH_LIMIT}</span>
                    </div>
                  </div>

                  <div className="hidden sm:block w-px my-2 bg-gradient-to-b from-transparent via-white/10 to-transparent" />

                  <div className="flex-1 flex flex-col items-center justify-center px-2.5 lg:px-3 py-2 rounded-xl hover:bg-white/5 transition-colors">
                    <span className="text-tiny uppercase tracking-[0.2em] text-neutral-500 font-black mb-0.5 whitespace-nowrap">{t('galaxy.fulfillments')}</span>
                    <div className="flex items-center gap-1">
                      <span className="text-secondary font-mono font-black text-emerald-300">{fulfilledToday}</span>
                      <span className="text-tiny font-bold text-emerald-500/30">/</span>
                      <span className="text-tiny font-bold text-emerald-500/50">{DAILY_FULFILL_LIMIT}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="text-center">
              <PageTitle
                title={t('galaxy.title')}
                Icon={Sparkles}
                gradientClassName="from-blue-200 via-fuchsia-300 to-cyan-200"
                iconClassName="w-4 h-4 xl:w-5 xl:h-5 text-cyan-200"
              />
            </div>
          </header>

          <p className="text-secondary text-neutral-400 leading-relaxed mb-4 shrink-0 text-center">
            {t('galaxy.subtitle')}
          </p>

          <div className={`grid gap-2 mb-2 flex-shrink-0 ${isLandscape ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-1'}`}>
            {[
              { title: t('galaxy.cards.intent_title'), desc: t('galaxy.cards.intent_desc'), icon: '🪐' },
              { title: t('galaxy.cards.pay_title'), desc: t('galaxy.cards.pay_desc'), icon: '⚡' },
              { title: t('galaxy.cards.support_title'), desc: t('galaxy.cards.support_desc'), icon: '🤝' },
            ].map((item, idx) => (
              <div key={item.title} className="relative overflow-hidden rounded-lg lg:rounded-xl border border-white/10 bg-white/5 backdrop-blur-lg p-2.5 lg:p-3 shadow-lg shadow-black/10">
                <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-white/0 opacity-60" />
                <div className="relative flex items-start gap-1.5">
                  <div className="text-base lg:text-lg">{item.icon}</div>
                  <div className="space-y-0.5 min-w-0">
                    <p className="text-tiny font-bold uppercase tracking-[0.12em] text-white/90">{item.title}</p>
                    <p className="text-tiny text-neutral-400 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
                <div className="absolute -right-6 -bottom-6 w-20 h-20 rounded-full bg-gradient-to-tr from-blue-500/10 via-purple-500/10 to-transparent blur-2xl" />
                <div className="absolute top-1 right-2 text-caption font-mono text-neutral-500">0{idx + 1}</div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div
            ref={wishTabsWrapRef}
            className="p-0.5 bg-white/5 border border-white/10 rounded-xl w-full max-w-full mx-auto mb-2 backdrop-blur-md shadow-lg shadow-blue-900/30 flex-shrink-0"
          >
            {!isWishTabsSplit ? (
              <div className="flex flex-wrap justify-center gap-1.5">
                <button
                  ref={wishTabOthersRef}
                  onClick={() => setActiveTab('others')}
                  className={`px-2.5 sm:px-3 lg:px-4 py-2 rounded-lg text-tiny font-bold uppercase tracking-widest whitespace-nowrap transition-all ${activeTab === 'others'
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                    : 'text-neutral-500 hover:text-white hover:bg-white/5'
                    }`}
                >
                  {t('galaxy.tabs.others')}
                </button>
                <button
                  ref={wishTabMineRef}
                  onClick={() => setActiveTab('mine')}
                  className={`px-2.5 sm:px-3 lg:px-4 py-2 rounded-lg text-tiny font-bold uppercase tracking-widest whitespace-nowrap transition-all ${activeTab === 'mine'
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                    : 'text-neutral-500 hover:text-white hover:bg-white/5'
                    }`}
                >
                  {t('galaxy.tabs.mine')}
                </button>
                <button
                  ref={wishTabCreateRef}
                  onClick={() => setActiveTab('create')}
                  className={`px-2.5 sm:px-3 lg:px-4 py-2 rounded-lg text-tiny font-bold uppercase tracking-widest whitespace-nowrap transition-all ${activeTab === 'create'
                    ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                    : 'text-neutral-500 hover:text-white hover:bg-white/5'
                    }`}
                >
                  {t('galaxy.tabs.create')}
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1.5">
                <div className="flex justify-center gap-1.5">
                  <button
                    ref={wishTabOthersRef}
                    onClick={() => setActiveTab('others')}
                    className={`px-2.5 sm:px-3 lg:px-4 py-2 rounded-lg text-tiny font-bold uppercase tracking-widest whitespace-nowrap transition-all ${activeTab === 'others'
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                      : 'text-neutral-500 hover:text-white hover:bg-white/5'
                      }`}
                  >
                    {t('galaxy.tabs.others')}
                  </button>
                  <button
                    ref={wishTabMineRef}
                    onClick={() => setActiveTab('mine')}
                    className={`px-2.5 sm:px-3 lg:px-4 py-2 rounded-lg text-tiny font-bold uppercase tracking-widest whitespace-nowrap transition-all ${activeTab === 'mine'
                      ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                      : 'text-neutral-500 hover:text-white hover:bg-white/5'
                      }`}
                  >
                    {t('galaxy.tabs.mine')}
                  </button>
                </div>
                <div className="flex justify-center">
                  <button
                    ref={wishTabCreateRef}
                    onClick={() => setActiveTab('create')}
                    className={`px-2.5 sm:px-3 lg:px-4 py-2 rounded-lg text-tiny font-bold uppercase tracking-widest whitespace-nowrap transition-all ${activeTab === 'create'
                      ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                      : 'text-neutral-500 hover:text-white hover:bg-white/5'
                      }`}
                  >
                    {t('galaxy.tabs.create')}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Content */}
          <AnimatePresence mode="wait">
            {activeTab === 'create' ? (
              <motion.div
                key="create"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="w-full"
              >
                <div className="bg-neutral-900/50 border border-white/10 backdrop-blur-2xl rounded-xl lg:rounded-2xl p-3 sm:p-4 lg:p-5 shadow-2xl relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-purple-400 to-transparent opacity-60 pointer-events-none" />
                  <div className="absolute -top-24 -right-10 w-64 h-64 bg-gradient-to-br from-purple-500/10 via-blue-500/5 to-transparent blur-3xl pointer-events-none" />
                  <div className="absolute -bottom-24 -left-10 w-72 h-72 bg-gradient-to-tr from-blue-500/10 via-cyan-400/10 to-transparent blur-3xl pointer-events-none" />

                  <h2 className="text-h3 text-white mb-2 lg:mb-3 text-center uppercase tracking-widest">
                    {t('galaxy.create.title')}
                  </h2>

                  <div className="space-y-2 lg:space-y-2.5">
                    <div className="relative group">
                      <textarea
                        value={wishText}
                        onChange={(e) => setWishText(e.target.value)}
                        placeholder={t('galaxy.create.placeholder')}
                        className="w-full min-h-[100px] lg:min-h-[110px] bg-black/40 border border-white/10 rounded-lg lg:rounded-xl p-3 lg:p-3.5 text-body text-white placeholder-neutral-600 focus:border-purple-500/50 focus:outline-none transition-all resize-none shadow-inner shadow-black/40"
                        maxLength={MAX_CHARS}
                      />
                      <div className="absolute bottom-2 lg:bottom-2.5 right-2.5 lg:right-3 text-tiny font-mono text-neutral-500 uppercase tracking-widest">
                        {wishText.length} / {MAX_CHARS}
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center justify-between gap-2 lg:gap-2.5 pt-0.5">
                      <div className="flex items-center gap-1.5 lg:gap-2 text-neutral-400">
                        <div className="w-7 h-7 lg:w-8 lg:h-8 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-xs lg:text-sm">
                          ✨
                        </div>
                        <div className="flex flex-col">
                          <span className="text-tiny font-bold uppercase tracking-widest">{t('galaxy.create.cost_label')}</span>
                          <span className="text-secondary font-bold text-white">{COST_PER_WISH} K</span>
                        </div>
                      </div>

                      <button
                        onClick={handleCreate}
                        disabled={!canCreate || sending}
                        className="w-full sm:w-auto px-5 lg:px-6 py-2 lg:py-2.5 bg-gradient-to-r from-purple-600 via-fuchsia-500 to-blue-600 rounded-lg font-bold text-white uppercase tracking-[0.2em] text-tiny shadow-xl shadow-purple-600/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed group relative overflow-hidden"
                      >
                        <span className="relative z-10">
                          {sending ? t('galaxy.create.sending') : t('galaxy.create.submit')}
                        </span>
                        {sending && (
                          <motion.div
                            className="absolute inset-0 bg-white/20"
                            initial={{ x: '-100%' }}
                            animate={{ x: '100%' }}
                            transition={{ repeat: Infinity, duration: 1 }}
                          />
                        )}
                      </button>
                    </div>
                  </div>

                  {showSuccess && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-3 lg:mt-4 p-2.5 lg:p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg lg:rounded-xl text-center"
                    >
                      <p className="text-emerald-400 text-secondary font-bold uppercase tracking-widest">
                        {t('galaxy.create.success')}
                      </p>
                    </motion.div>
                  )}
                </div>

                <p className="mt-3 lg:mt-4 text-center text-tiny text-neutral-500 leading-relaxed max-w-4xl mx-auto uppercase tracking-wider">
                  {t('galaxy.create.note')}
                </p>
              </motion.div>
            ) : activeTab === 'mine' ? (
              <motion.div
                key="mine"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className={`grid gap-3 lg:gap-4 ${isLandscape ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1'}`}
              >
                {wishes.filter(w => w.isMine).length === 0 ? (
                  <div className="col-span-full text-center py-20">
                    <div className="text-6xl mb-6">🌠</div>
                    <p className="text-h2 text-neutral-400 uppercase tracking-widest">{t('galaxy.mine.empty_title')}</p>
                    <p className="text-body text-neutral-600 mt-4">{t('galaxy.mine.empty_desc')}</p>
                  </div>
                ) : (
                  wishes.filter(w => w.isMine).map((wish, index) => (
                    <motion.div
                      key={wish.id}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: index * 0.05 }}
                      className="group relative flex flex-col bg-neutral-900/50 border border-emerald-500/20 backdrop-blur-xl rounded-xl lg:rounded-2xl p-4 lg:p-5 shadow-xl hover:border-emerald-500/40 transition-all overflow-hidden"
                    >
                      <div className="absolute -top-12 -right-6 w-32 h-32 rounded-full bg-gradient-to-br from-emerald-500/10 via-blue-500/10 to-transparent blur-2xl opacity-80 transition-all group-hover:scale-110 pointer-events-none" />
                      <div className="absolute inset-0 opacity-0 group-hover:opacity-20 transition-opacity bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.08),transparent_40%)] pointer-events-none" />
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-tiny font-mono text-neutral-500 uppercase tracking-widest">
                          {wish.date}
                        </span>
                        <span className={`text-tiny font-bold uppercase tracking-widest px-2 py-1 rounded-md ${wish.status === 'open' ? 'text-blue-400 bg-blue-400/10' :
                          wish.status === 'pending' ? 'text-amber-400 bg-amber-400/10' :
                            'text-emerald-400 bg-emerald-400/10'
                          }`}>
                          {wish.status === 'open'
                            ? t('galaxy.status.open')
                            : wish.status === 'pending'
                              ? t('galaxy.status.pending')
                              : t('galaxy.status.fulfilled')}
                        </span>
                      </div>

                      <p className="text-secondary text-neutral-200 leading-relaxed mb-6 flex-1 italic" data-no-translate>
                        &quot;{wish.text}&quot;
                      </p>

                      <div className="space-y-3">
                        <div className="flex items-center gap-3 text-tiny text-neutral-400 font-bold uppercase tracking-widest border-b border-white/5 pb-3">
                          <div className="flex items-center gap-1.5">
                            <span className="text-rose-500">❤️</span> {wish.supports}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-blue-400">✨</span> {formatUserK(wish.supportK)} K
                          </div>
                        </div>

                        {wish.status === 'pending' && (
                          <button
                            type="button"
                            onClick={() => {
                              console.log('mark fulfilled click', wish);
                              setMarkFulfilledWish(wish);
                            }}
                            className="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-green-600 rounded-lg text-tiny font-bold uppercase tracking-widest hover:scale-[1.02] transition-all shadow-lg shadow-emerald-600/20 cursor-pointer"
                          >
                            {t('galaxy.mine.mark_fulfilled_btn')}
                          </button>
                        )}
                      </div>
                    </motion.div>
                  ))
                )}
              </motion.div>
            ) : (
              <motion.div
                key="others"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className={`grid gap-3 lg:gap-4 ${isLandscape ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1'}`}
              >
                {wishes.filter(w => !w.isMine && w.status !== 'fulfilled').map((wish, index) => (
                  <motion.div
                    key={wish.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: index * 0.05 }}
                    className="group relative flex flex-col bg-neutral-900/50 border border-white/10 backdrop-blur-xl rounded-xl lg:rounded-2xl p-4 lg:p-5 shadow-xl hover:border-white/20 transition-all overflow-hidden"
                  >
                    <div className="absolute -top-12 -right-6 w-32 h-32 rounded-full bg-gradient-to-br from-blue-500/10 via-purple-500/10 to-transparent blur-2xl opacity-80 transition-all group-hover:scale-110 pointer-events-none" />
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-20 transition-opacity bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.08),transparent_40%)] pointer-events-none" />
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-tiny font-mono text-neutral-500 uppercase tracking-widest">
                        {wish.date}
                      </span>
                      <span className={`text-tiny font-bold uppercase tracking-widest px-2 py-1 rounded-md ${wish.status === 'open' ? 'text-blue-400 bg-blue-400/10' :
                        wish.status === 'pending' ? 'text-amber-400 bg-amber-400/10' :
                          'text-emerald-400 bg-emerald-400/10'
                        }`}>
                        {wish.status === 'open'
                          ? t('galaxy.status.open')
                          : wish.status === 'pending'
                            ? t('galaxy.status.pending')
                            : t('galaxy.status.fulfilled')}
                      </span>
                    </div>

                    <p className="text-secondary text-neutral-200 leading-relaxed mb-6 flex-1 italic" data-no-translate>
                      &quot;{wish.text}&quot;
                    </p>

                    <div className="space-y-3">
                      <div className="flex items-center gap-3 text-tiny text-neutral-400 font-bold uppercase tracking-widest border-b border-white/5 pb-3">
                        <div className="flex items-center gap-1.5">
                          <span className="text-rose-500">❤️</span> {wish.supports}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-blue-400">✨</span> {formatUserK(wish.supportK)} K
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            console.log('support click', wish);
                            setSupportModalWish(wish);
                          }}
                          className="py-2 bg-white/5 border border-white/10 rounded-lg text-tiny font-bold uppercase tracking-widest hover:bg-white/10 transition-all cursor-pointer"
                        >
                          {t('galaxy.actions.support')}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            console.log('fulfill click', wish);
                            setFulfillModalWish(wish);
                          }}
                          className="py-2 bg-blue-600/10 border border-blue-600/20 text-blue-400 rounded-lg text-tiny font-bold uppercase tracking-widest hover:bg-blue-600/20 transition-all cursor-pointer"
                        >
                          {t('galaxy.actions.fulfill')}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Wish launch trail */}
          <AnimatePresence>
            {launchId && (
              <motion.div
                key={launchId}
                className="pointer-events-none fixed left-1/2 bottom-20 z-40"
                initial={{ opacity: 0, y: 0, scale: 0.8 }}
                animate={{ opacity: 1, y: -420, scale: 1.1 }}
                exit={{ opacity: 0, y: -460, scale: 1.15 }}
                transition={{ duration: 1.2, ease: 'easeOut' }}
              >
                <div className="relative">
                  <div className="w-2 h-28 mx-auto bg-gradient-to-t from-transparent via-purple-400/70 to-blue-300/0 blur-[2px]" />
                  <div className="absolute inset-0 w-10 h-10 -left-4 top-20 rounded-full bg-gradient-to-br from-purple-400 via-fuchsia-300 to-blue-300 blur-xl opacity-70" />
                  <div className="w-6 h-6 mx-auto rounded-full bg-gradient-to-br from-white via-blue-100 to-purple-200 shadow-[0_0_30px_rgba(147,197,253,0.6)]" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Правый рекламный блок - Show only in landscape on large screens */}
        <StickySideAdRail adSlot={sideAdSlot} page="galaxy" placement="galaxy_sidebar_right" />
      </div>

      {/* Support Modal */}
      <AnimatePresence>
        {supportModalWish && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setSupportModalWish(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-md bg-neutral-900 border border-white/10 rounded-[2.5rem] p-8 shadow-2xl"
            >
              <h3 className="text-h3 font-bold text-white mb-2 uppercase tracking-widest">{t('galaxy.support_modal.title')}</h3>
              <p className="text-tiny text-neutral-500 mb-8 uppercase tracking-widest">{t('galaxy.support_modal.subtitle')}</p>

              <div className="space-y-6">
                <div className="relative">
                  <input
                    type="number"
                    value={supportAmount}
                    onChange={(e) => setSupportAmount(e.target.value)}
                    placeholder={t('galaxy.support_modal.placeholder')}
                    className="w-full bg-black/40 border border-white/10 rounded-2xl p-4 text-white font-mono text-h2 focus:border-blue-500/50 focus:outline-none transition-all"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-tiny font-bold text-neutral-500 uppercase tracking-widest">K</div>
                </div>

                <div className="flex justify-between text-tiny font-bold uppercase tracking-widest px-2">
                  <span className="text-neutral-500">{t('galaxy.support_modal.your_balance')}</span>
                  <span className="text-blue-400">{formatUserK(userK)} K</span>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setSupportModalWish(null)}
                    className="flex-1 py-4 text-tiny font-bold uppercase tracking-widest text-neutral-500 hover:text-white transition-colors"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    onClick={handleSupportConfirm}
                    disabled={!supportAmount || parseInt(supportAmount) <= 0 || parseInt(supportAmount) > userK}
                    className="flex-1 py-4 bg-blue-600 rounded-2xl text-tiny font-bold uppercase tracking-widest text-white shadow-lg shadow-blue-600/20 disabled:opacity-50 transition-all"
                  >
                    {t('common.next')}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Fulfill Modal */}
      <AnimatePresence>
        {fulfillModalWish && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setFulfillModalWish(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-lg bg-neutral-900 border border-white/10 rounded-[2.5rem] p-8 shadow-2xl"
            >
              <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-3xl mb-6 mx-auto">
                🤝
              </div>
              <h3 className="text-h3 font-bold text-white mb-4 text-center uppercase tracking-widest">{t('galaxy.fulfill_modal.title')}</h3>

              <div className="bg-blue-500/5 border border-blue-500/10 rounded-2xl p-4 mb-8">
                <p className="text-tiny text-neutral-400 leading-relaxed text-center uppercase tracking-widest">
                  {t('galaxy.fulfill_modal.note')}
                </p>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-tiny font-bold text-neutral-500 uppercase tracking-widest ml-2">{t('galaxy.fulfill_modal.contact_label')}</label>
                  <input
                    type="text"
                    value={contactInfo}
                    onChange={(e) => setContactInfo(e.target.value)}
                    placeholder={t('galaxy.fulfill_modal.contact_placeholder')}
                    className="w-full bg-black/40 border border-white/10 rounded-2xl p-4 text-body text-white focus:border-blue-500/50 focus:outline-none transition-all"
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setFulfillModalWish(null)}
                    className="flex-1 py-4 text-tiny font-bold uppercase tracking-widest text-neutral-500 hover:text-white transition-colors"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    onClick={handleFulfill}
                    disabled={!contactInfo}
                    className="flex-1 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl text-tiny font-bold uppercase tracking-widest text-white shadow-lg shadow-blue-600/20 disabled:opacity-50 transition-all"
                  >
                    {t('common.check')}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Support Confirmation Modal */}
      <AnimatePresence>
        {showSupportConfirm && supportModalWish && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowSupportConfirm(false)}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-md bg-neutral-900 border border-white/10 rounded-[2.5rem] p-8 shadow-2xl"
            >
              <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-3xl mb-6 mx-auto">
                ⚠️
              </div>
              <h3 className="text-xl font-bold text-white mb-4 text-center uppercase tracking-widest">{t('galaxy.support_confirm.title')}</h3>

              <div className="bg-amber-500/5 border border-amber-500/10 rounded-2xl p-4 mb-8">
                <p className="text-sm text-neutral-300 text-center mb-3">
                  {t('galaxy.support_confirm.you_send')}{' '}
                  <span className="text-blue-400 font-bold">{supportAmount} K</span>{' '}
                  {t('galaxy.support_confirm.to_support')}
                </p>
                <p className="text-label text-neutral-500 text-center">
                  {t('galaxy.support_confirm.note')}
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowSupportConfirm(false);
                    setSupportModalWish(null);
                    setSupportAmount('');
                  }}
                  className="flex-1 py-4 text-xs font-bold uppercase tracking-widest text-neutral-500 hover:text-white transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleSupport}
                  className="flex-1 py-4 bg-blue-600 rounded-2xl text-xs font-bold uppercase tracking-widest text-white shadow-lg shadow-blue-600/20 transition-all hover:scale-[1.02]"
                >
                  {t('common.check')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Mark Fulfilled Modal */}
      <AnimatePresence>
        {markFulfilledWish && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setMarkFulfilledWish(null)}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-md bg-neutral-900 border border-emerald-500/30 rounded-[2.5rem] p-8 shadow-2xl"
            >
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-green-500/10 border border-emerald-500/30 flex items-center justify-center text-5xl mb-6 mx-auto">
                🎉
              </div>
              <h3 className="text-2xl font-bold text-white mb-4 text-center uppercase tracking-widest">{t('galaxy.mark_fulfilled.title')}</h3>

              <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-2xl p-5 mb-8">
                <p className="text-sm text-neutral-200 text-center mb-4 leading-relaxed">
                  {t('galaxy.mark_fulfilled.body')}
                </p>
                <p className="text-label text-neutral-500 text-center">
                  {t('galaxy.mark_fulfilled.reward_prefix')}{' '}
                  <span className="text-emerald-400 font-bold">+{FULFILL_REWARD} K</span>
                  {t('galaxy.mark_fulfilled.reward_suffix')}
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setMarkFulfilledWish(null)}
                  className="flex-1 py-4 text-xs font-bold uppercase tracking-widest text-neutral-500 hover:text-white transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleMarkFulfilled}
                  className="flex-1 py-4 bg-gradient-to-r from-emerald-600 to-green-600 rounded-2xl text-xs font-bold uppercase tracking-widest text-white shadow-lg shadow-emerald-600/30 transition-all hover:scale-[1.02]"
                >
                  {t('common.check')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style jsx global>{`
        @keyframes gradient-x {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        .animate-gradient-x {
          background-size: 200% 200%;
          animation: gradient-x 15s ease infinite;
        }
      `}</style>
    </div>
  );
}

