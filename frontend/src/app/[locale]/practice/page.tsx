'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AdaptiveAdWrapper } from '@/components/AdaptiveAdWrapper';
import { apiGet } from '@/utils/api';
import { PageTitle } from '@/components/PageTitle';
import { StickySideAdRail } from '@/components/StickySideAdRail';
import { TreeBlessingPanel } from '@/components/practice/TreeBlessingPanel';
import { getResponsiveSideAdSlot } from '@/utils/sideAdSlot';
import { Sparkles } from 'lucide-react';
import { useI18n } from '@/context/I18nContext';
import { getLocalizedField } from '@/i18n/localizedContent';

interface Quote {
  _id?: string;
  text: string;
  author: string;
  translations?: {
    en?: {
      text?: string;
      author?: string;
    };
  };
}

type CollectiveSession = {
  id?: string | number;
  startsAt?: string | number;
  phase1Min?: string | number;
  phase2Min?: string | number;
  rounds?: string | number;
};

export default function PracticePage() {
  const { language, localePath, t } = useI18n();
  const [windowWidth, setWindowWidth] = useState(0);
  const sideAdSlot = getResponsiveSideAdSlot(windowWidth, typeof window !== 'undefined' ? window.innerHeight : 0);
  const isDesktop = Boolean(sideAdSlot);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [serverTimeBaseMs, setServerTimeBaseMs] = useState<number | null>(null);
  const [serverPerfBaseMs, setServerPerfBaseMs] = useState<number | null>(null);
  const [serverTzOffsetMin, setServerTzOffsetMin] = useState(0);
  const [clockTick, setClockTick] = useState(0);
  const [collectiveSession, setCollectiveSession] = useState<CollectiveSession | null>(null);
  const [collectiveParticipantsCount, setCollectiveParticipantsCount] = useState<number | null>(null);

  useEffect(() => {
    const updateLayout = () => {
      const w = window.innerWidth;
      setWindowWidth(w);
    };

    updateLayout();
    window.addEventListener('resize', updateLayout);
    return () => window.removeEventListener('resize', updateLayout);
  }, []);

  useEffect(() => {
    const fetchQuote = async () => {
      try {
        const res = await fetch('/quotes/active');
        console.log('Quote response status:', res.status);
        if (res.ok) {
          const data = await res.json();
          console.log('Quote data:', data);
          if (data) {
            setQuote({
              _id: data._id,
              text: data.text,
              author: data.author,
              translations: data.translations,
            });
          }
        } else {
          console.error('Quote API error:', res.statusText);
        }
      } catch (e) {
        console.error('Failed to fetch quote:', e);
      }
    };

    fetchQuote();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await apiGet<{ serverNow: number; serverTzOffsetMin?: number; activeSession: unknown; nextSession: unknown }>(
          '/meditation/collective'
        );
        if (cancelled) return;
        const serverNow = Number(res.serverNow);
        setServerTimeBaseMs(Number.isFinite(serverNow) ? serverNow : null);
        setServerPerfBaseMs(typeof performance !== 'undefined' ? performance.now() : null);
        setServerTzOffsetMin(Number.isFinite(Number(res.serverTzOffsetMin)) ? Number(res.serverTzOffsetMin) : 0);

        const pickSession = (value: unknown): CollectiveSession | null => {
          if (typeof value !== 'object' || value === null) return null;
          const v = value as Record<string, unknown>;
          return {
            id: typeof v.id === 'string' || typeof v.id === 'number' ? v.id : undefined,
            startsAt: typeof v.startsAt === 'string' || typeof v.startsAt === 'number' ? v.startsAt : undefined,
            phase1Min: typeof v.phase1Min === 'string' || typeof v.phase1Min === 'number' ? v.phase1Min : undefined,
            phase2Min: typeof v.phase2Min === 'string' || typeof v.phase2Min === 'number' ? v.phase2Min : undefined,
            rounds: typeof v.rounds === 'string' || typeof v.rounds === 'number' ? v.rounds : undefined,
          };
        };

        const session = pickSession(res.activeSession) || pickSession(res.nextSession) || null;
        setCollectiveSession(session);
      } catch {
        if (!cancelled) {
          setServerTimeBaseMs(null);
          setServerPerfBaseMs(null);
          setCollectiveSession(null);
        }
      }
    };

    load();
    const interval = window.setInterval(load, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setClockTick((value) => (value + 1) % 1000000);
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const sessionId = collectiveSession?.id ? String(collectiveSession.id) : null;
    if (!sessionId) {
      setCollectiveParticipantsCount(null);
      return;
    }

    let cancelled = false;
    const loadParticipants = async () => {
      try {
        const result = await apiGet<{ total?: number }>(`/meditation/collective/participants?sessionId=${encodeURIComponent(sessionId)}`);
        if (!cancelled) {
          setCollectiveParticipantsCount(Number.isFinite(Number(result?.total)) ? Number(result.total) : 0);
        }
      } catch {
        if (!cancelled) {
          setCollectiveParticipantsCount(0);
        }
      }
    };

    loadParticipants();
    const interval = window.setInterval(loadParticipants, 5_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [collectiveSession?.id]);

  const now = serverTimeBaseMs != null && serverPerfBaseMs != null
    ? serverTimeBaseMs + (performance.now() - serverPerfBaseMs)
    : Date.now();
  void clockTick;
  const startsAt = collectiveSession?.startsAt ? Number(collectiveSession.startsAt) : null;
  const phase1Min = Math.max(0, Number(collectiveSession?.phase1Min ?? 1) || 1);
  const phase2Min = Math.max(0, Number(collectiveSession?.phase2Min ?? 1) || 1);
  const rounds = Math.max(1, Number(collectiveSession?.rounds ?? 3) || 3);
  const durationMs = Math.round((phase1Min + phase2Min) * rounds * 60 * 1000);
  const endsAt = startsAt != null ? startsAt + durationMs : null;
  const isCollectiveActive = startsAt != null && endsAt != null && now >= startsAt && now < endsAt;
  const msUntilStart = startsAt != null ? Math.max(0, startsAt - now) : 0;
  const hh = String(Math.floor(msUntilStart / 3600000)).padStart(2, '0');
  const mm = String(Math.floor((msUntilStart % 3600000) / 60000)).padStart(2, '0');
  const ss = String(Math.floor((msUntilStart % 60000) / 1000)).padStart(2, '0');
  const countdown = `${hh}:${mm}:${ss}`;

  const serverTime = new Date(now + (serverTzOffsetMin * 60 * 1000));
  const serverTimeHh = String(serverTime.getUTCHours()).padStart(2, '0');
  const serverTimeMm = String(serverTime.getUTCMinutes()).padStart(2, '0');
  const serverTimeSs = String(serverTime.getUTCSeconds()).padStart(2, '0');
  const serverClock = `${serverTimeHh}:${serverTimeMm}:${serverTimeSs}`;
  const quoteText = quote ? getLocalizedField(quote.text, quote.translations, 'text', language) : '';
  const quoteAuthor = quote ? getLocalizedField(quote.author, quote.translations, 'author', language) : '';

  return (
    <div
      className={`flex-1 flex flex-col min-h-0 ${windowWidth >= 768 ? 'overflow-hidden' : 'overflow-y-auto'} bg-[#050510] text-slate-200 font-sans selection:bg-cyan-500/30`}
    >
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-cyan-900/20 via-[#050510] to-[#050510]" />
        <div className="absolute top-1/4 right-1/4 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute bottom-1/3 left-1/4 h-48 w-48 rounded-full bg-indigo-500/10 blur-3xl" />
      </div>

      <div className="relative z-10 flex flex-1 min-h-0">
        <StickySideAdRail adSlot={sideAdSlot} page="practice" placement="practice_sidebar_left" />

        <div className="flex-1 flex flex-col min-w-0 px-3 lg:px-4 py-2 lg:py-3 min-h-0">
          <div className={`${isDesktop ? 'hidden' : 'flex'} mx-auto mb-6 shrink-0 justify-center w-full`}>
            <AdaptiveAdWrapper
              page="practice"
              placement="practice_header"
              strategy="mobile_tablet_adaptive"
            />
          </div>

          <header className="mb-4 flex-shrink-0 flex flex-col gap-3">
            <div className="flex items-center justify-between w-full">
              <Link
                href={localePath('/tree')}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-white/5 border border-white/10 rounded-lg font-bold uppercase tracking-widest text-tiny hover:bg-white/10 transition-all active:scale-95 group backdrop-blur-md"
              >
                <span className="group-hover:-translate-x-1 transition-transform">←</span> {t('nav.to_tree')}
              </Link>

              <span
                aria-hidden
                className="inline-flex sm:hidden items-center gap-1.5 px-4 py-2 bg-white/5 border border-white/10 rounded-lg font-bold uppercase tracking-widest text-tiny backdrop-blur-md invisible"
              >
                ← {t('nav.to_tree')}
              </span>
            </div>

            <PageTitle
              title={t('practice.title')}
              Icon={Sparkles}
              gradientClassName="from-cyan-200 via-cyan-400 to-blue-500"
              iconClassName="w-4 h-4 xl:w-5 xl:h-5 text-cyan-200"
            />
          </header>

          <div className="grid gap-4 mb-6">
            {quote && (
              <div className="relative overflow-hidden rounded-xl border border-white/10 bg-white/5 backdrop-blur-md p-4">
                <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-2xl" />
                <p className="text-sm text-white/70 italic relative z-10">«{quoteText}»</p>
                <p className="text-xs text-white/40 mt-2 relative z-10">— {quoteAuthor}</p>
              </div>
            )}

            <div className="page-content-reading grid gap-3 sm:grid-cols-2">
              <Link href={localePath('/practice/meditation')} className="group">
                <div className="relative h-28 rounded-xl border border-cyan-500/30 bg-gradient-to-br from-cyan-900/40 via-cyan-800/20 to-transparent p-4 transition-all hover:border-cyan-400/60">
                  <div className="absolute right-3 top-3 text-2xl opacity-30">🧘</div>
                  <div className="relative z-10 h-full flex flex-col justify-between">
                    <div>
                      <div className="text-secondary font-bold text-cyan-200">{t('practice.meditation')}</div>
                      <div className="text-tiny text-white/60">{t('practice_page.meditation_desc')}</div>
                    </div>
                    <div className="text-tiny uppercase tracking-widest text-cyan-200/80">{t('common.open')}</div>
                  </div>
                </div>
              </Link>

              <Link href={localePath('/practice/gratitude')} className="group">
                <div className="relative h-28 rounded-xl border border-indigo-500/30 bg-gradient-to-br from-indigo-900/40 via-indigo-800/20 to-transparent p-4 transition-all hover:border-indigo-400/60">
                  <div className="absolute right-3 top-3 text-2xl opacity-30">💙</div>
                  <div className="relative z-10 h-full flex flex-col justify-between">
                    <div>
                      <div className="text-secondary font-bold text-indigo-200">{t('practice.gratitude')}</div>
                      <div className="text-tiny text-white/60">{t('practice_page.gratitude_desc')}</div>
                    </div>
                    <div className="text-tiny uppercase tracking-widest text-indigo-200/80">{t('common.open')}</div>
                  </div>
                </div>
              </Link>
            </div>

            <div className="relative overflow-hidden rounded-xl border border-white/10 bg-white/5 backdrop-blur-md p-4">
              <div className="text-label text-white/50 mb-3">{t('practice_page.stats_title')}</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <div className="text-label text-white/50">{t('practice_page.server_time')}</div>
                  <div className="mt-1 text-lg font-bold text-white/90 tabular-nums">{serverClock}</div>
                </div>

                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <div className="text-label text-white/50">{t('practice_page.status')}</div>
                  <div className={`mt-1 text-lg font-bold ${collectiveSession?.startsAt ? (isCollectiveActive ? 'text-red-300' : 'text-cyan-200') : 'text-white/50'}`}>
                    {collectiveSession?.startsAt
                      ? (isCollectiveActive
                        ? t('practice_page.session_active')
                        : `${t('practice_page.until_start')} ${countdown}`)
                      : '—'}
                  </div>
                </div>

                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <div className="text-label text-white/50">{t('practice_page.participants')}</div>
                  <div className="mt-1 text-lg font-bold text-white/90">
                    {collectiveSession?.startsAt ? (collectiveParticipantsCount == null ? '—' : collectiveParticipantsCount) : '—'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <TreeBlessingPanel />
          </div>
        </div>

        <StickySideAdRail adSlot={sideAdSlot} page="practice" placement="practice_sidebar_right" />
      </div>
    </div>
  );
}
