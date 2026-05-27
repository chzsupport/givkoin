'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, XCircle } from 'lucide-react';
import { usePathname } from 'next/navigation';

import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';
import { apiGet, apiPost } from '@/utils/api';

import styles from './HumanCheckGate.module.css';
import { POLL_INTERVAL_MS, VARIANT_LABEL_KEYS } from './constants';
import { VariantRenderer } from './HumanCheckVariants';
import { isHumanCheckExcludedPath } from './humanCheckPath';
import type { ActiveChallenge, HumanCheckResult, HumanCheckStatus } from './types';

export function HumanCheckGate() {
  const pathname = usePathname();
  const { isAuthenticated, isAuthLoading, logout, user } = useAuth();
  const { t, localePath } = useI18n();
  const [challenge, setChallenge] = useState<ActiveChallenge | null>(null);
  const challengeRef = useRef<ActiveChallenge | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [successVisible, setSuccessVisible] = useState(false);
  const [blockedMessage, setBlockedMessage] = useState('');
  const [logoutCountdown, setLogoutCountdown] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [lastError, setLastError] = useState('');
  const logoutStartedRef = useRef(false);

  useEffect(() => {
    challengeRef.current = challenge;
  }, [challenge]);

  const excluded = isHumanCheckExcludedPath(pathname || '/');

  const startForcedLogout = useCallback((message: string) => {
    setBlockedMessage(message);
    setLogoutCountdown(10);
    setChallenge(null);
    challengeRef.current = null;
    setSuccessVisible(false);
    setLastError('');
    logoutStartedRef.current = false;
  }, []);

  const loadStatus = useCallback(async () => {
    if (isAuthLoading || !isAuthenticated || !user?._id || excluded) {
      setChallenge(null);
      return;
    }

    try {
      const data = await apiGet<HumanCheckStatus>('/auth/human-check/status', { suppressBoostOffer: true });
      if (data.blocked) {
        startForcedLogout(t('human_check.blocked'));
        return;
      }

      if (data.required && data.challengeId && data.variant) {
        const current = challengeRef.current;
        const nextChallenge = {
          challengeId: data.challengeId,
          variant: data.variant,
          attemptsLeft: Math.max(0, Number(data.attemptsLeft) || 0),
        };
        if (!current || current.challengeId !== nextChallenge.challengeId || current.variant !== nextChallenge.variant) {
          setResetKey((value) => value + 1);
        }
        setChallenge(nextChallenge);
        return;
      }

      setChallenge(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message) setLastError(message);
    }
  }, [excluded, isAuthLoading, isAuthenticated, startForcedLogout, t, user?._id]);

  useEffect(() => {
    if (!blockedMessage || logoutCountdown == null) return undefined;

    if (logoutCountdown <= 0) {
      if (logoutStartedRef.current) return undefined;
      logoutStartedRef.current = true;
      setBlockedMessage('');
      setChallenge(null);
      challengeRef.current = null;
      logout();
      window.setTimeout(() => {
        window.location.replace(localePath('/login'));
      }, 50);
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setLogoutCountdown((value) => (value == null ? null : Math.max(0, value - 1)));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [blockedMessage, localePath, logout, logoutCountdown]);

  useEffect(() => {
    void loadStatus();
    if (isAuthLoading || !isAuthenticated || excluded) return undefined;
    const interval = window.setInterval(() => {
      void loadStatus();
    }, POLL_INTERVAL_MS);
    const onFocus = () => void loadStatus();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void loadStatus();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [excluded, isAuthLoading, isAuthenticated, loadStatus]);

  useEffect(() => {
    if (!challenge && !blockedMessage) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [blockedMessage, challenge]);

  const handlePass = useCallback(async () => {
    const current = challengeRef.current;
    if (!current || submitting) return;
    setSubmitting(true);
    setLastError('');
    try {
      const data = await apiPost<HumanCheckResult>('/auth/human-check/pass', {
        challengeId: current.challengeId,
        variant: current.variant,
      }, { suppressBoostOffer: true });
      if (data.blocked) {
        startForcedLogout(t('human_check.blocked'));
        return;
      }
      setSuccessVisible(true);
      window.setTimeout(() => {
        setSuccessVisible(false);
        setChallenge(null);
        challengeRef.current = null;
      }, 700);
    } catch (error) {
      const message = error instanceof Error ? error.message : t('human_check.error');
      setLastError(message);
      void loadStatus();
    } finally {
      setSubmitting(false);
    }
  }, [loadStatus, startForcedLogout, submitting, t]);

  const handleFail = useCallback(async () => {
    const current = challengeRef.current;
    if (!current || submitting) return;
    setSubmitting(true);
    setLastError('');
    try {
      const data = await apiPost<HumanCheckResult>('/auth/human-check/fail', {
        challengeId: current.challengeId,
        variant: current.variant,
      }, { suppressBoostOffer: true });
      if (data.blocked || data.challengeFailed) {
        startForcedLogout(data.message || (data.blocked ? t('human_check.blocked') : t('human_check.failed_logout')));
        return;
      }
      setChallenge({
        ...current,
        attemptsLeft: Math.max(0, Number(data.attemptsLeft) || 0),
      });
      setResetKey((value) => value + 1);
      setLastError(t('human_check.wrong'));
    } catch (error) {
      const message = error instanceof Error ? error.message : t('human_check.blocked');
      startForcedLogout(message);
    } finally {
      setSubmitting(false);
    }
  }, [startForcedLogout, submitting, t]);

  const active = challenge && !excluded;

  if (!active && !blockedMessage) return null;

  const variantLabel = challenge
    ? t(VARIANT_LABEL_KEYS[challenge.variant])
    : t('human_check.title');
  const attemptsLeft = challenge?.attemptsLeft ?? 0;

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="human-check-title">
      <motion.div
        className={styles.panel}
        initial={{ opacity: 0, scale: 0.96, y: 18 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.22 }}
      >
        <div className={styles.header}>
          <p className={styles.eyebrow}>{t('human_check.eyebrow')}</p>
          <h2 id="human-check-title" className={styles.title}>{t('human_check.title')}</h2>
        </div>
        <div className={styles.body}>
          <p className={styles.description}>{t('human_check.description')}</p>
          <div className={styles.statusRow}>
            <span>{variantLabel}</span>
            <span className={styles.attempts}>
              {t('human_check.attempts_left')}: {attemptsLeft}
            </span>
          </div>
          <div className={styles.stage}>
            {challenge && (
              <div className={styles.variantWrap}>
                <VariantRenderer
                  variant={challenge.variant}
                  disabled={submitting || successVisible || Boolean(blockedMessage)}
                  resetKey={resetKey}
                  t={t}
                  onPass={handlePass}
                  onFail={handleFail}
                />
              </div>
            )}
            {successVisible && (
              <div className={styles.successLayer}>
                <div className={styles.successIcon}>
                  <CheckCircle2 size={44} />
                </div>
                <strong>{t('human_check.passed')}</strong>
              </div>
            )}
            {blockedMessage && (
              <div className={styles.blockedLayer}>
                <div className={styles.blockedIcon}>
                  <XCircle size={44} />
                </div>
                <strong>{blockedMessage}</strong>
                {logoutCountdown != null && (
                  <span className={styles.countdown}>
                    {t('human_check.redirect_countdown')}: {logoutCountdown}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className={styles.smallError}>{lastError}</div>
        </div>
      </motion.div>
    </div>
  );
}
