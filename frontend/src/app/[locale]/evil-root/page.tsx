'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { apiPost } from '@/utils/api';
import { useI18n } from '@/context/I18nContext';

interface FlyingText {
  id: number;
  text: string;
  startXPercent: number;
  startYPercent: number;
  duration: number;
}

const MotionDivAny = motion.div as unknown as (props: Record<string, unknown>) => JSX.Element;
const MotionSpanAny = motion.span as unknown as (props: Record<string, unknown>) => JSX.Element;

export default function BlackHolePage() {
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
    () => `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  );

  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const phraseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const MAX_SYMBOLS = 1000;
  const EVIL_ROOT_PHRASE_KEYS = [
    'i_understand',
    'you_great',
    'all_fine',
    'not_alone',
    'will_pass',
    'you_cope',
    'breathe_evenly',
    'stronger_than',
    'you_matter',
    'with_you_spirit',
    'give_time',
    'work_out',
    'difficult_moment',
    'right_to_rest',
    'step_forward',
    'within_power',
    'you_safe',
    'deserve_peace',
    'pause_movement',
    'you_valuable',
    'own_path',
    'dont_rush',
    'start_over',
    'listen_yourself',
    'you_coping',
    'small_steps',
    'feeling_normal',
    'allow_exhale',
    'temporary',
    'stronger_fear',
    'know_hold_on',
    'light_near',
    'not_perfect',
    'mistakes_ok',
    'deserve_kindness',
    'will_change',
    'been_through',
    'not_alone_this',
    'easier_each_step',
    'trust_yourself',
    'can_say_stop',
    'can_be_gentle',
    'cope_today',
    'matter_world',
    'deserve_peace_world',
    'feelings_matter',
    'peace_will_come',
    'find_way_out',
    'can_ask_help',
    'not_carry_alone',
    'take_breath',
    'slow_exhale',
    'right_path',
    'allow_relax',
    'dont_blame',
    'deserve_respect',
    'just_day',
    'strength_inside',
    'can_slow_down',
    'you_can',
    'become_clearer',
    'not_forever',
    'shown_courage',
    'see_further',
    'let_go_unnecessary',
    'fall_into_place',
    'deserve_warmth',
    'not_always_strong',
    'good_enough',
    'no_expectations',
    'choose_yourself',
    'be_yourself',
    'right_to_pause',
    'self_support',
    'will_be_calm',
    'get_easier',
    'coping_better',
    'know_love',
    'know_self_care',
    'deserve_light',
    'be_gentler',
    'let_go_pain',
    'done_a_lot',
    'allow_hope',
    'not_lonely',
    'you_needed',
    'moving_forward',
    'you_okay',
    'as_good_as_can',
    'peace_near',
    'survive_this',
    'can_breathe',
    'safe_now',
    'not_control_all',
    'can_say_no',
    'choose_silence',
    'allowed_mistakes',
    'entitled_peace',
    'know_be_strong',
    'pain_matters',
    'boundaries_matter',
    'take_care',
    'deserve_self_respect',
    'no_hurry',
    'be_honest',
    'step_by_step',
    'shown_resilience',
    'gradually_better',
    'allow_rest',
    'will_be_ok',
    'learn_let_go',
    'find_support',
    'deserve_kindness2',
    'okay_with_you',
    'right_to_feel',
    'choose_peace',
    'deserve_acceptance',
    'not_convenient',
    'solvable',
    'i_believe',
  ] as const;

  const PHRASES = EVIL_ROOT_PHRASE_KEYS.map((key) => t(`evil_root.${key}`));

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
    // Старт из нижней четверти, по центру экрана по UX
    const baseX = 50;
    const baseY = 78;

    // Базовая длительность полёта контейнера.
    // Новый медленный диапазон: 10.0–12.0s.
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

    // Черная яма — полностью анонимная.
    // На сервер отправляем только счётчики, без текста.
    // Делаем только визуальный эффект "улёта" и очищаем поле.
    createFlyingText(trimmed);
    setText('');
    setSymbolsSent((prev) => prev + symbols);
    setMessagesSent((prev) => prev + 1);

    const nextSince = messagesSincePhrase + 1;
    if (nextSince >= nextPhraseAt) {
      const phrase = PHRASES[Math.floor(Math.random() * PHRASES.length)];
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

    // Небольшая блокировка отправки от случайного дабл-клика.
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
        // Ошибку не блокируем — сессия не должна “ломать” выход
      })
      .finally(() => {
        router.push(localePath('/tree'));
      });
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black overflow-hidden"
      style={{
        overflow: 'hidden',          // убираем скролл на этой странице
        overscrollBehavior: 'none',  // блокируем инерционную прокрутку
      }}
    >
      {/* Видео-фон Черной ямы */}
      <video
        src="/black-hole.mp4"
        autoPlay
        loop
        muted
        playsInline
        preload="metadata"
        className="absolute inset-0 w-full h-full object-cover -z-20"
      />

      {/* Слой звёзд/частиц над видео, под основным контентом */}

      <AnimatePresence>
        {supportPhrase && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 0.75, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.6 }}
            className="absolute top-8 left-1/2 -translate-x-1/2 text-neutral-200/80 text-[28px] md:text-[36px] font-light tracking-wide z-20"
          >
            {supportPhrase}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Слой для анимирующихся текстов: над фоном, под блоком ввода */}
      <div className="absolute inset-0 pointer-events-none z-30">
        {flyingTexts.map((item) => {
          const chars = Array.from(item.text);

          // Центр "дыры"
          const centerX = 50;
          const centerY = 50;

          // Начальная позиция контейнера
          const startX = item.startXPercent;
          const startY = item.startYPercent;

          // Вектор от старта к центру
          const vectorX = centerX - startX;
          const vectorY = centerY - startY;

          // Используем duration из структуры как базу.
          // Клампинг полёта контейнера, замедленный в 2 раза: 18.0–28.0s.
          // (Ранее 9.0–14.0s.)
          const containerDuration =
            Math.min(28.0, Math.max(18.0, (item.duration || 11.0) * 2));

          return (
            <MotionDivAny
              key={item.id}
              initial={{
                x: `${startX}vw`,
                y: `${startY}vh`,
                opacity: 1,
                scale: 1,
                translateX: '-50%',
                translateY: '-50%',
                filter: 'blur(0px)',
              } as React.CSSProperties}
              animate={{
                x: '50vw',
                y: '50vh',
                opacity: 0.04,
                scale: 0.18,
                filter: 'blur(8px)',
              }}
              transition={{
                duration: containerDuration,
                ease: [0.16, 0.72, 0.35, 1], // мягкий старт, ускорение к центру
              }}
              className="absolute text-body text-neutral-200/90 whitespace-pre-wrap text-center will-change-transform will-change-opacity"
              onAnimationComplete={() => {
                // Удаляем только свой элемент по id, без накопления истории
                setFlyingTexts((prev) => prev.filter((f) => f.id !== item.id));
              }}
            >
              <div className="inline-flex flex-wrap justify-center gap-[0.5px]">
                {chars.map((ch, index) => {
                  const len = Math.max(chars.length, 1);

                  // Базовый t [0..1] вдоль текста
                  const t = index / len;

                  // Лёгкое индивидуальное отклонение (сохраняем общий вектор к центру)
                  const deviationStrength = 0.18; // маленький, чтобы не было "фейерверка"
                  const randX = (Math.random() - 0.5) * deviationStrength;
                  const randY = (Math.random() - 0.5) * deviationStrength;

                  const targetX =
                    vectorX * (0.9 + t * 0.2) + randX * 100; // все тянутся к центру, чуть ближе/дальше
                  const targetY =
                    vectorY * (0.9 + t * 0.2) + randY * 100;

                  // Диапазон длительностей букв, замедленный в 2 раза: 6.0–12.0s
                  // (Ранее 3.0–6.0s)
                  const letterDuration =
                    6.0 + Math.random() * 6.0;

                  // Базовая задержка по индексу + рандом под более медленный контейнер (18–28s)
                  // (Ранее baseDelay=0.25 и jitter до 0.6s)
                  const baseDelay = 0.5;
                  const delayByIndex = baseDelay * t;
                  const randomJitter = Math.random() * 1.2;
                  const letterDelay = delayByIndex + randomJitter;

                  // Гарантируем, что буквы завершают растворение до конца контейнера
                  const maxLetterEnd = letterDelay + letterDuration;
                  const adjustedDuration =
                    maxLetterEnd > containerDuration
                      ? Math.max(0.6, containerDuration - letterDelay)
                      : letterDuration;

                  const blurAmount = 2 + Math.random() * 3; // мягкий монохромный blur

                  return (
                    <MotionSpanAny
                      key={`${item.id}-${index}`}
                      initial={{
                        opacity: 1,
                        x: 0,
                        y: 0,
                        filter: 'blur(0px)',
                      }}
                      animate={{
                        opacity: 0,
                        x: `${targetX}vw`,
                        y: `${targetY}vh`,
                        filter: `blur(${blurAmount}px)`,
                      }}
                      transition={{
                        duration: adjustedDuration,
                        delay: letterDelay,
                        ease: [0.22, 0.66, 0.4, 1],
                      }}
                      className="inline-block"
                    >
                      {ch === ' ' ? '\u00A0' : ch}
                    </MotionSpanAny>
                  );
                })}
              </div>
            </MotionDivAny>
          );
        })}
      </div>

      <div className="absolute left-0 right-0 bottom-10 flex items-center justify-center z-40 overflow-x-hidden">
        <div className="flex flex-col items-center justify-center w-full text-body text-neutral-200 px-4">
          {/* Поле ввода Черной ямы:
              - 5 видимых строк по умолчанию.
              - Ширина подобрана под ~150 символов (max-w-5xl + центрирование).
              - Без скролла: высота растёт автоматически по мере ввода.
              - Максимум 1000 символов. */}
          <textarea
            ref={inputRef}
            value={text}
            rows={5}
            onChange={(e) => {
              let value = e.target.value;

              // Жёсткий лимит по общему количеству символов
              if (value.length > MAX_SYMBOLS) {
                value = value.slice(0, MAX_SYMBOLS);
              }

              setText(value);

              // Авто-рост высоты без скролла
              const el = e.target;
              el.style.height = 'auto';
              el.style.height = el.scrollHeight + 'px';
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (!isSending && text.trim()) {
                  handleSubmit();
                  // После отправки вернуть высоту к начальному состоянию (5 строк)
                  if (inputRef.current) {
                    inputRef.current.style.height = 'auto';
                  }
                }
              }
            }}
            placeholder=""
            className="w-full max-w-5xl bg-transparent text-center text-neutral-100 placeholder:text-neutral-500/40 focus:outline-none focus:ring-0 focus:border-none border-none mx-auto resize-none italic leading-relaxed text-body"
            style={{
              caretColor: '#9CA3AF',
              overflow: 'hidden',
              maxHeight: '22vh', // ограничиваем рост, чтобы суммарно textarea + отступы оставались внутри viewport
            }}
          />
          <div className="mt-2 text-caption text-neutral-400/70">
            {text.length} / {MAX_SYMBOLS}
          </div>
          <div className="mt-3 flex flex-col items-center gap-2 mb-2">
            <span
              onClick={() => {
                if (!isSending && text.trim()) {
                  handleSubmit();
                }
              }}
              className={`pointer-events-auto select-none transition-opacity text-secondary ${isSending || !text.trim()
                ? 'opacity-30 cursor-default'
                : 'opacity-80 hover:opacity-100 cursor-pointer'
                }`}
            >
              {t('common.send')}
            </span>
            <span
              onClick={handleFinish}
              className="pointer-events-auto select-none opacity-70 hover:opacity-100 transition-opacity cursor-pointer text-secondary"
            >
              {t('evil_root.finish_session')}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
