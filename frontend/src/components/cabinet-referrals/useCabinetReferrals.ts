import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getSiteLanguage, getSiteLanguageLocale } from '@/i18n/siteLanguage';
import { apiGet, apiPost } from '@/utils/api';
import { REFERRAL_PAGE_LIMIT } from './constants';
import { emitReferralRewardOffer } from './referralEvents';
import type { ManualReferralBoostStatus, ReferralStats, ReferralText } from './types';

type ReferralBoostCompletedEvent = CustomEvent<{
  offerType?: string;
  result?: { referralManualBoost?: ManualReferralBoostStatus };
}>;

export function useCabinetReferrals(t: ReferralText) {
  const { user, refreshUser } = useAuth();
  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [boostModalOpen, setBoostModalOpen] = useState(false);
  const [manualBoost, setManualBoost] = useState<ManualReferralBoostStatus | null>(null);
  const [loadingStep, setLoadingStep] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [siteOrigin, setSiteOrigin] = useState('');

  useEffect(() => {
    setSiteOrigin(`${window.location.protocol}//${window.location.host}`);
  }, []);

  const referralLink = useMemo(() => {
    if (!user?.nickname || !siteOrigin) return t('common.loading');
    return `${siteOrigin}/ref/${user.nickname}`;
  }, [siteOrigin, t, user?.nickname]);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const data = await apiGet<ReferralStats>(`/referrals?limit=${REFERRAL_PAGE_LIMIT}&offset=0`);
        setStats(data);
        setManualBoost(data.manualBoost || null);
      } catch (error) {
        console.error('Failed to fetch referral stats', error);
      }
    };

    if (user) {
      fetchStats();
    }
  }, [user]);

  const loadMoreReferrals = useCallback(async () => {
    if (!stats?.hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await apiGet<ReferralStats>(`/referrals?limit=${REFERRAL_PAGE_LIMIT}&offset=${stats.referrals.length}`);
      setStats((prev) => prev ? {
        ...prev,
        ...data,
        referrals: [...prev.referrals, ...(data.referrals || [])],
      } : data);
    } catch (error) {
      console.error('Failed to load more referrals', error);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, stats?.hasMore, stats?.referrals.length]);

  const handleCopy = useCallback(() => {
    if (!user?.nickname) return;
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [referralLink, user?.nickname]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as ReferralBoostCompletedEvent).detail;
      if (detail?.offerType !== 'referral_manual_step') return;
      if (detail.result?.referralManualBoost) {
        setManualBoost(detail.result.referralManualBoost);
      }
      setLoadingStep(null);
      refreshUser();
    };
    window.addEventListener('givkoin:ad-boost-completed', handler);
    return () => window.removeEventListener('givkoin:ad-boost-completed', handler);
  }, [refreshUser]);

  const startManualBoostStep = useCallback(async (step: number) => {
    if (loadingStep || manualBoost?.active || manualBoost?.watchedSteps?.includes(step)) return;
    setLoadingStep(step);
    try {
      const result = await apiPost<unknown>('/referrals/manual-boost/step', { step }, { suppressBoostOffer: true });
      if (typeof result === 'object' && result !== null && 'status' in result) {
        const status = (result as { status?: ManualReferralBoostStatus }).status;
        if (status) setManualBoost(status);
      }
      emitReferralRewardOffer(typeof result === 'object' && result !== null ? (result as { boostOffer?: unknown }).boostOffer : null);
    } catch (error) {
      console.error('Failed to start referral manual boost step', error);
    } finally {
      setLoadingStep(null);
    }
  }, [loadingStep, manualBoost?.active, manualBoost?.watchedSteps]);

  const activeUntilLabel = manualBoost?.activeUntil
    ? new Date(manualBoost.activeUntil).toLocaleString(getSiteLanguageLocale(getSiteLanguage()))
    : '';
  const activeMessage = t('referrals.manual_boost_active_message')
    .replace('{percent}', String(manualBoost?.percent || 5))
    .replace('{until}', activeUntilLabel);

  return {
    activeMessage,
    boostModalOpen,
    copied,
    handleCopy,
    loadMoreReferrals,
    loadingMore,
    loadingStep,
    manualBoost,
    referralLink,
    setBoostModalOpen,
    startManualBoostStep,
    stats,
    user,
  };
}
