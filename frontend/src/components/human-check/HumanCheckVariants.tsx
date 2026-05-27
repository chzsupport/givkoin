import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';
import {
  ArrowRight,
  Cloud,
  Image as ImageIcon,
  Moon,
  ShieldAlert,
  Star,
  Sun,
} from 'lucide-react';

import styles from './HumanCheckGate.module.css';
import { CATCH_MOVE_INTERVAL_MS, CATCH_ORB_STIFFNESS } from './constants';
import type { HumanCheckVariant, VariantProps } from './types';

function HoldVariant({ disabled, resetKey, t, onPass, onFail }: VariantProps) {
  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<number | null>(null);
  const passedRef = useRef(false);
  const failedRef = useRef(false);

  const clearHold = useCallback(() => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    clearHold();
    passedRef.current = false;
    failedRef.current = false;
    setHolding(false);
    setProgress(0);
    return clearHold;
  }, [clearHold, resetKey]);

  const startHold = () => {
    if (disabled || passedRef.current || failedRef.current || timerRef.current != null) return;
    setHolding(true);
    let nextProgress = 0;
    timerRef.current = window.setInterval(() => {
      nextProgress += 2.5;
      setProgress(Math.min(100, nextProgress));
      if (nextProgress >= 100) {
        passedRef.current = true;
        clearHold();
        setHolding(false);
        onPass();
      }
    }, 50);
  };

  const stopHold = () => {
    if (disabled || passedRef.current || failedRef.current) return;
    const wasHolding = timerRef.current != null;
    clearHold();
    setHolding(false);
    setProgress(0);
    if (wasHolding) {
      failedRef.current = true;
      onFail();
    }
  };

  return (
    <div className={styles.centerColumn}>
      <p className={styles.hint}>{t('human_check.hold_hint')}</p>
      <motion.button
        type="button"
        className={styles.holdButton}
        aria-label={t('human_check.hold_button')}
        onPointerDown={startHold}
        onPointerUp={stopHold}
        onPointerCancel={stopHold}
        onPointerLeave={stopHold}
        animate={{
          scale: holding ? 0.96 : 1,
          boxShadow: holding ? '0 0 36px rgba(130,243,208,0.34)' : 'inset 0 0 24px rgba(0,0,0,0.34)',
        }}
      >
        <span className={styles.holdFill} style={{ height: `${progress}%` }} />
        <span className={styles.holdInner}>
          <ShieldAlert size={34} />
        </span>
      </motion.button>
    </div>
  );
}

function SliderVariant({ disabled, resetKey, t, onPass, onFail }: VariantProps) {
  const sliderWidth = 320;
  const thumbWidth = 58;
  const targetX = sliderWidth - thumbWidth - 8;
  const x = useMotionValue(0);
  const fillWidth = useTransform(x, [0, targetX], [thumbWidth, sliderWidth]);
  const passedRef = useRef(false);

  useEffect(() => {
    passedRef.current = false;
    x.set(0);
  }, [resetKey, x]);

  const handleDragEnd = () => {
    if (disabled || passedRef.current) return;
    const value = x.get();
    if (value >= targetX - 18) {
      passedRef.current = true;
      x.set(targetX);
      onPass();
      return;
    }
    x.set(0);
    onFail();
  };

  return (
    <div className={styles.centerColumn}>
      <p className={styles.hint}>{t('human_check.slider_hint')}</p>
      <div className={styles.sliderTrack}>
        <motion.div className={styles.sliderFill} style={{ width: fillWidth }} />
        <div className={styles.sliderText}>{t('human_check.slider_inside')}</div>
        <motion.button
          type="button"
          className={styles.sliderThumb}
          aria-label={t('human_check.slider_button')}
          drag={disabled ? false : 'x'}
          dragConstraints={{ left: 0, right: targetX }}
          dragElastic={0}
          dragMomentum={false}
          onDragEnd={handleDragEnd}
          style={{ x }}
          whileTap={{ scale: 0.95 }}
        >
          <ArrowRight size={22} />
        </motion.button>
      </div>
    </div>
  );
}

function OrderVariant({ disabled, resetKey, t, onPass, onFail }: VariantProps) {
  const [sequence, setSequence] = useState<string[]>([]);
  const [error, setError] = useState(false);
  const target = useMemo(() => ['sun', 'star', 'moon'], []);
  const icons = useMemo(() => [
    { id: 'sun', Icon: Sun, color: '#f8c75c', label: t('human_check.icon_sun') },
    { id: 'moon', Icon: Moon, color: '#c6d1ff', label: t('human_check.icon_moon') },
    { id: 'star', Icon: Star, color: '#82f3d0', label: t('human_check.icon_star') },
    { id: 'cloud', Icon: Cloud, color: '#a9b4cf', label: t('human_check.icon_cloud') },
  ], [t]);

  useEffect(() => {
    setSequence([]);
    setError(false);
  }, [resetKey]);

  const handleClick = (id: string) => {
    if (disabled) return;
    const nextSequence = [...sequence, id];
    setSequence(nextSequence);
    setError(false);

    if (nextSequence.length !== target.length) return;

    const correct = nextSequence.every((value, index) => value === target[index]);
    if (correct) {
      onPass();
      return;
    }

    setError(true);
    window.setTimeout(() => {
      setSequence([]);
      setError(false);
      onFail();
    }, 450);
  };

  return (
    <div className={styles.centerColumn}>
      <p className={styles.hint}>{t('human_check.order_hint')}</p>
      <motion.div
        className={styles.iconGrid}
        animate={error ? { x: [-10, 10, -8, 8, 0] } : {}}
        transition={{ duration: 0.34 }}
      >
        {icons.map(({ id, Icon, color, label }) => {
          const selectedIndex = sequence.indexOf(id);
          const selected = selectedIndex !== -1;
          return (
            <motion.button
              key={id}
              type="button"
              className={`${styles.iconButton} ${selected ? styles.iconButtonActive : ''}`}
              aria-label={label}
              onClick={() => handleClick(id)}
              whileHover={{ scale: disabled ? 1 : 1.06 }}
              whileTap={{ scale: disabled ? 1 : 0.95 }}
            >
              <Icon size={30} color={color} />
              {selected && <span className={styles.badge}>{selectedIndex + 1}</span>}
            </motion.button>
          );
        })}
      </motion.div>
    </div>
  );
}

function RotateVariant({ disabled, resetKey, t, onPass, onFail }: VariantProps) {
  const [rotation, setRotation] = useState(138);

  useEffect(() => {
    setRotation(138);
  }, [resetKey]);

  const checkRotation = () => {
    if (disabled) return;
    if (rotation <= 14 || rotation >= 346) {
      setRotation(0);
      onPass();
      return;
    }
    onFail();
  };

  return (
    <div className={styles.centerColumn}>
      <p className={styles.hint}>{t('human_check.rotate_hint')}</p>
      <div className={styles.rotateOrb}>
        <motion.div style={{ rotate: rotation }}>
          <ImageIcon size={54} color="#82f3d0" />
        </motion.div>
      </div>
      <input
        className={styles.range}
        type="range"
        min="0"
        max="360"
        value={rotation}
        disabled={disabled}
        aria-label={t('human_check.rotate_slider')}
        onChange={(event) => setRotation(Number(event.target.value))}
      />
      <button type="button" className={styles.checkButton} disabled={disabled} onClick={checkRotation}>
        {t('common.check')}
      </button>
    </div>
  );
}

function CatchVariant({ disabled, resetKey, t, onPass, onFail }: VariantProps) {
  const [position, setPosition] = useState({ x: 50, y: 58 });
  const passedRef = useRef(false);

  useEffect(() => {
    passedRef.current = false;
    setPosition({ x: 50, y: 58 });
  }, [resetKey]);

  useEffect(() => {
    if (disabled) return undefined;
    const interval = window.setInterval(() => {
      if (passedRef.current) return;
      setPosition({
        x: Math.random() * 74 + 13,
        y: Math.random() * 58 + 30,
      });
    }, CATCH_MOVE_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [disabled, resetKey]);

  const catchOrb = () => {
    if (disabled || passedRef.current) return;
    passedRef.current = true;
    onPass();
  };

  return (
    <div
      className={styles.catchField}
      onClick={(event) => {
        if (disabled || passedRef.current) return;
        const target = event.target instanceof HTMLElement ? event.target : null;
        if (!target?.closest(`.${styles.orbButton}`)) onFail();
      }}
    >
      <p className={styles.catchHint}>{t('human_check.catch_hint')}</p>
      <motion.button
        type="button"
        className={styles.orbButton}
        aria-label={t('human_check.catch_button')}
        onClick={catchOrb}
        animate={{ left: `${position.x}%`, top: `${position.y}%` }}
        transition={{ type: 'spring', damping: 12, stiffness: CATCH_ORB_STIFFNESS }}
        whileHover={{ scale: disabled ? 1 : 1.12 }}
        whileTap={{ scale: disabled ? 1 : 0.9 }}
        style={{ transform: 'translate(-50%, -50%)' }}
      />
    </div>
  );
}

export function VariantRenderer(props: VariantProps & { variant: HumanCheckVariant }) {
  switch (props.variant) {
    case 'slider':
      return <SliderVariant {...props} />;
    case 'order':
      return <OrderVariant {...props} />;
    case 'rotate':
      return <RotateVariant {...props} />;
    case 'catch':
      return <CatchVariant {...props} />;
    case 'hold':
    default:
      return <HoldVariant {...props} />;
  }
}
