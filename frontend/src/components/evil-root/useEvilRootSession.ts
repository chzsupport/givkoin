import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/context/I18nContext';
import { apiPost } from '@/utils/api';
import { EVIL_ROOT_PHRASE_KEYS } from './constants';
import type { FlyingText } from './types';

export function useEvilRootSession() {
  const router = useRouter();
  const { t, localePath } = useI18n();
  const [text, setText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [flyingTexts, setFlyingTexts] = useState<FlyingText[]>([]);
  const [symbolsSent, setSymbolsSent] = useState(0);
  const [messagesSent, setMessagesSent] = useState(0);
  const [supportPhrase, setSupportPhrase] = useState<string | null>(null);
  const [messagesSincePhrase, setMessagesSincePhrase] = useState(0);
  const [nextPhraseAt, setNextPhraseAt] = useState(3 + Math.floor(Math.random() * 3));
  const [sessionId] = useState(
    () => `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  );
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const phraseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const phrases = useMemo(
    () => EVIL_ROOT_PHRASE_KEYS.map((key) => t(`evil_root.${key}`)),
    [t],
  );

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
    return () => {
      if (phraseTimeoutRef.current) {
        clearTimeout(phraseTimeoutRef.current);
      }
    };
  }, []);

  const createFlyingText = (content: string) => {
    const baseX = 50;
    const baseY = 78;
    const duration = 10.0 + Math.random() * 2.0;

    const flying: FlyingText = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      text: content,
      startXPercent: baseX,
      startYPercent: baseY,
      duration,
    };

    setFlyingTexts((prev) => [...prev, flying]);
  };

  const handleSubmit = async () => {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;

    const symbols = trimmed.length;

    createFlyingText(trimmed);
    setText('');
    setSymbolsSent((prev) => prev + symbols);
    setMessagesSent((prev) => prev + 1);

    const nextSince = messagesSincePhrase + 1;
    if (nextSince >= nextPhraseAt) {
      const phrase = phrases[Math.floor(Math.random() * phrases.length)];
      setSupportPhrase(phrase);
      setMessagesSincePhrase(0);
      setNextPhraseAt(3 + Math.floor(Math.random() * 3));
      if (phraseTimeoutRef.current) {
        clearTimeout(phraseTimeoutRef.current);
      }
      phraseTimeoutRef.current = setTimeout(() => {
        setSupportPhrase(null);
      }, 4000);
    } else {
      setMessagesSincePhrase(nextSince);
    }

    setIsSending(true);
    setTimeout(() => {
      setIsSending(false);
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }, 400);
  };

  const handleFinish = () => {
    if (isFinishing) return;
    setIsFinishing(true);

    const payload = {
      sessionId,
      symbols: symbolsSent,
      messages: messagesSent,
    };

    apiPost('/evil-root/session', payload)
      .catch(() => {
        // Выход со страницы не должен ломаться из-за сетевой ошибки.
      })
      .finally(() => {
        router.push(localePath('/tree'));
      });
  };

  const removeFlyingText = (id: number) => {
    setFlyingTexts((prev) => prev.filter((item) => item.id !== id));
  };

  return {
    flyingTexts,
    handleFinish,
    handleSubmit,
    inputRef,
    isSending,
    removeFlyingText,
    setText,
    supportPhrase,
    t,
    text,
  };
}
