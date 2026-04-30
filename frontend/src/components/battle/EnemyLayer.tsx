'use client';

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import type { EnemyHitEvent } from './enemyZones';
import {
  ENEMY_ZONES,
  getZoneNormalizedBounds,
  isPointWithinOutline,
  normalizePointToOutline,
} from './enemyZones';

export type WeaponId = 1 | 2 | 3;

type MaskSampler = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

type ImpactFlash = {
  id: number;
  x: number;
  y: number;
};

export type EnemyLayerHit = EnemyHitEvent & { id: number };

const WEAPON_TRIGGER_THRESHOLDS: Record<WeaponId, number> = {
  1: 50,
  2: 6,
  3: 1,
};

const SILHOUETTE_TRANSFORM = 'translate(1px, -2px) translateY(-3%)';
const REACTION_FADE_DURATION_MS = 600;
const IMPACT_PULSE_KEYFRAMES = `
@keyframes impactPulseAnimation {
  0% {
    transform: scale(0.4);
    opacity: 0.95;
  }
  60% {
    transform: scale(1);
    opacity: 0.6;
  }
  100% {
    transform: scale(1.4);
    opacity: 0;
  }
}`;

type ReactionVideoOverlayProps = {
  isVisible: boolean;
  videoRef: React.MutableRefObject<HTMLVideoElement | null>;
  onEnded: () => void;
  opacity: number;
  src: string;
};

function ReactionVideoOverlay({
  isVisible,
  videoRef,
  onEnded,
  opacity,
  src,
}: ReactionVideoOverlayProps) {
  const clampedOpacity = Math.max(0, Math.min(1, opacity));
  const containerStyle: React.CSSProperties = {
    opacity: isVisible ? clampedOpacity : 0,
    transition: `opacity ${REACTION_FADE_DURATION_MS}ms ease-out`,
  };
  return (
    <div className="absolute inset-0 z-10 pointer-events-none" style={containerStyle} aria-hidden={!isVisible}>
      <video
        ref={videoRef}
        className="w-full h-full object-cover"
        src={src}
        playsInline
        muted
        preload="auto"
        onEnded={onEnded}
      />
    </div>
  );
}

function ImpactFlashLayer({ flashes }: { flashes: ImpactFlash[] }) {
  if (flashes.length === 0) return null;
  return (
    <div className="absolute inset-0 z-15 pointer-events-none" style={{ transform: SILHOUETTE_TRANSFORM }}>
      <style>{IMPACT_PULSE_KEYFRAMES}</style>
      {flashes.map((flash) => (
        <div
          key={flash.id}
          className="absolute"
          style={{
            left: `${flash.x * 100}%`,
            top: `${(1 - flash.y) * 100}%`,
            transform: 'translate(-50%, -50%)',
          }}
        >
          <div
            style={{
              width: '72px',
              height: '72px',
              borderRadius: '50%',
              background:
                'radial-gradient(circle, rgba(0,255,255,0.9) 0%, rgba(0,255,255,0.15) 55%, rgba(0,255,255,0) 90%)',
              boxShadow: '0 0 20px rgba(0,255,255,0.8), 0 0 36px rgba(0,153,255,0.65)',
              animation: 'impactPulseAnimation 450ms ease-out forwards',
            }}
          />
        </div>
      ))}
    </div>
  );
}

function HitFlashOverlay({
  flashKey,
  silhouetteSrc,
}: {
  flashKey: number;
  silhouetteSrc: string;
}) {
  const [visible, setVisible] = useState(false);
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    if (!flashKey) return;
    setVisible(true);
    setPulse(0);
    let frame = 0;
    const interval = setInterval(() => {
      frame += 1;
      setPulse(frame / 20);
      if (frame >= 20) {
        clearInterval(interval);
        setVisible(false);
      }
    }, 20);
    return () => clearInterval(interval);
  }, [flashKey]);

  if (ENEMY_ZONES.length === 0) return null;
  const maskUrl = `url("${silhouetteSrc}")`;
  const outlineStyle: CSSProperties = {
    WebkitMaskImage: maskUrl,
    maskImage: maskUrl,
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
    WebkitMaskSize: '100% 100%',
    maskSize: '100% 100%',
    WebkitMaskPosition: 'center',
    maskPosition: 'center',
    background: 'transparent',
    boxShadow: `
      inset 0 0 0 ${2 + pulse * 4}px #00ffff,
      inset 0 0 ${20 + pulse * 30}px ${2 + pulse * 3}px #00ffff,
      0 0 ${8 + pulse * 12}px #00ffff,
      0 0 ${16 + pulse * 20}px #0099ff
    `,
    filter: `drop-shadow(0 0 ${8 + pulse * 10}px #00ffff) drop-shadow(0 0 ${16 + pulse * 15}px #0099ff)`,
    mixBlendMode: 'screen',
    opacity: visible ? Math.max(0, 1 - pulse * 0.5) : 0,
    transition: 'opacity 50ms linear',
  };

  return (
    <div className="absolute inset-0 z-16 pointer-events-none" style={{ transform: SILHOUETTE_TRANSFORM }}>
      <div className="w-full h-full" style={outlineStyle} />
    </div>
  );
}

function DebugGridOverlay() {
  if (ENEMY_ZONES.length === 0) return null;
  const outline = ENEMY_ZONES[0];
  const { left, right, top, bottom } = getZoneNormalizedBounds(outline);
  const style: React.CSSProperties = {
    left: `${left * 100}%`,
    top: `${100 - top * 100}%`,
    width: `${(right - left) * 100}%`,
    height: `${(top - bottom) * 100}%`,
    transform: 'translate(1px, -2px)',
  };
  return (
    <div className="absolute inset-0 z-5 pointer-events-none">
      <div className="absolute border-2 border-yellow-400/60 bg-yellow-100/5" style={style} />
    </div>
  );
}

export interface EnemyLayerProps {
  hitEvent?: EnemyLayerHit | null;
  onValidHit?: (event: EnemyHitEvent) => void;
  backgroundSrc?: string;
  reactionSrc?: string;
  silhouetteSrc?: string;
  pointerEvents?: CSSProperties['pointerEvents'];
  className?: string;
  style?: CSSProperties;
  showDebugGrid?: boolean;
}

export function EnemyLayer({
  hitEvent,
  onValidHit,
  backgroundSrc = '/relax.mp4',
  reactionSrc = '/atack.mp4',
  silhouetteSrc = '/siluet.svg',
  pointerEvents = 'none',
  className = '',
  style,
  showDebugGrid = false,
}: EnemyLayerProps) {
  const [enemyHit, setEnemyHit] = useState(false);
  const [hitFlashKey, setHitFlashKey] = useState(0);
  const [impactFlashes, setImpactFlashes] = useState<ImpactFlash[]>([]);
  const [reactionOverlayVisible, setReactionOverlayVisible] = useState(false);
  const [reactionOpacity, setReactionOpacity] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const reactionVideoRef = useRef<HTMLVideoElement | null>(null);
  const reactionTimeoutRef = useRef<number | null>(null);
  const reactionFadeTimeoutRef = useRef<number | null>(null);
  const reactionOpacityRafRef = useRef<number | null>(null);
  const hitsTrackerRef = useRef<{ byWeapon: Record<WeaponId, number> }>({
    byWeapon: { 1: 0, 2: 0, 3: 0 },
  });
  const maskSamplerRef = useRef<MaskSampler | null>(null);
  const impactIdRef = useRef(0);
  const flashTimeoutsRef = useRef<Map<number, number>>(new Map());

  useEffect(() => {
    const flashTimeouts = flashTimeoutsRef.current;
    if (videoRef.current) {
      videoRef.current.loop = true;
      videoRef.current.muted = true;
      void videoRef.current.play();
    }
    if (reactionVideoRef.current) {
      reactionVideoRef.current.muted = true;
    }
    return () => {
      if (reactionTimeoutRef.current) window.clearTimeout(reactionTimeoutRef.current);
      if (reactionFadeTimeoutRef.current) window.clearTimeout(reactionFadeTimeoutRef.current);
      if (reactionOpacityRafRef.current) window.cancelAnimationFrame(reactionOpacityRafRef.current);
      flashTimeouts.forEach((timeoutId) => window.clearTimeout(timeoutId));
      flashTimeouts.clear();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.src = silhouetteSrc;
    img.onload = () => {
      if (cancelled) return;
      const naturalWidth = img.naturalWidth || img.width || 1440;
      const naturalHeight = img.naturalHeight || img.height || 735;
      if (naturalWidth === 0 || naturalHeight === 0) {
        maskSamplerRef.current = null;
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = naturalWidth;
      canvas.height = naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        maskSamplerRef.current = null;
        return;
      }
      ctx.drawImage(img, 0, 0, naturalWidth, naturalHeight);
      const imageData = ctx.getImageData(0, 0, naturalWidth, naturalHeight);
      maskSamplerRef.current = {
        width: naturalWidth,
        height: naturalHeight,
        data: imageData.data,
      };
    };
    img.onerror = () => {
      if (!cancelled) maskSamplerRef.current = null;
    };
    return () => {
      cancelled = true;
    };
  }, [silhouetteSrc]);

  const isPointInsideMask = useCallback((worldX: number, worldY: number) => {
    const sampler = maskSamplerRef.current;
    if (!sampler) return false;
    const { width, height, data } = sampler;
    const { nx, ny } = normalizePointToOutline(worldX, worldY);
    if (!Number.isFinite(nx) || !Number.isFinite(ny)) return false;
    if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return false;
    const px = Math.min(width - 1, Math.max(0, Math.round(nx * (width - 1))));
    const py = Math.min(height - 1, Math.max(0, Math.round((1 - ny) * (height - 1))));
    const index = (py * width + px) * 4;
    const alpha = data[index + 3];
    return alpha > 16;
  }, []);

  useEffect(() => {
    if (!enemyHit) {
      setReactionOpacity(0);
      if (reactionOverlayVisible) {
        if (reactionFadeTimeoutRef.current) {
          window.clearTimeout(reactionFadeTimeoutRef.current);
          reactionFadeTimeoutRef.current = null;
        }
        reactionFadeTimeoutRef.current = window.setTimeout(() => {
          setReactionOverlayVisible(false);
          reactionFadeTimeoutRef.current = null;
        }, REACTION_FADE_DURATION_MS);
      }
      return;
    }

    if (reactionFadeTimeoutRef.current) {
      window.clearTimeout(reactionFadeTimeoutRef.current);
      reactionFadeTimeoutRef.current = null;
    }
    setReactionOverlayVisible(true);
    if (reactionOpacityRafRef.current) {
      window.cancelAnimationFrame(reactionOpacityRafRef.current);
    }
    reactionOpacityRafRef.current = window.requestAnimationFrame(() => setReactionOpacity(1));
  }, [enemyHit, reactionOverlayVisible]);

  useEffect(() => {
    if (!enemyHit) {
      if (reactionTimeoutRef.current) {
        window.clearTimeout(reactionTimeoutRef.current);
        reactionTimeoutRef.current = null;
      }
      if (reactionVideoRef.current) {
        window.setTimeout(() => {
          reactionVideoRef.current?.pause();
          if (reactionVideoRef.current) reactionVideoRef.current.currentTime = 0;
        }, REACTION_FADE_DURATION_MS);
      }
      if (videoRef.current && videoRef.current.paused) {
        videoRef.current.play().catch(() => {
          /* autoplay guard */
        });
      }
      return;
    }

    const reactionVideo = reactionVideoRef.current;
    if (!reactionVideo) return;

    const clearTimer = () => {
      if (reactionTimeoutRef.current) {
        window.clearTimeout(reactionTimeoutRef.current);
        reactionTimeoutRef.current = null;
      }
    };

    const scheduleAutoReset = () => {
      const fallbackDuration = 6000;
      const duration =
        Number.isFinite(reactionVideo.duration) && reactionVideo.duration > 0
          ? reactionVideo.duration * 1000 + 150
          : fallbackDuration;
      clearTimer();
      reactionTimeoutRef.current = window.setTimeout(() => setEnemyHit(false), duration);
    };

    const attemptPlay = () => {
      reactionVideo.pause();
      reactionVideo.currentTime = 0;
      const promise = reactionVideo.play();
      if (promise && typeof promise.then === 'function') {
        promise
          .then(() => {
            scheduleAutoReset();
          })
          .catch(() => {
            reactionVideo.muted = true;
            reactionVideo
              .play()
              .then(() => scheduleAutoReset())
              .catch(() => {
                clearTimer();
                setEnemyHit(false);
              });
          });
      } else {
        scheduleAutoReset();
      }
    };

    if (reactionVideo.readyState >= 2) {
      attemptPlay();
      return () => clearTimer();
    }

    const handleLoaded = () => {
      reactionVideo.removeEventListener('loadeddata', handleLoaded);
      attemptPlay();
    };

    reactionVideo.addEventListener('loadeddata', handleLoaded);
    return () => {
      reactionVideo.removeEventListener('loadeddata', handleLoaded);
      clearTimer();
    };
  }, [enemyHit]);

  const registerHit = useCallback(
    (event: EnemyLayerHit) => {
      const { weaponId, worldPoint } = event;
      if (!isPointWithinOutline(worldPoint.x, worldPoint.y) || !isPointInsideMask(worldPoint.x, worldPoint.y)) {
        return;
      }

      onValidHit?.(event);
      setHitFlashKey((prev) => prev + 1);
      const { nx, ny } = normalizePointToOutline(worldPoint.x, worldPoint.y);
      if (Number.isFinite(nx) && Number.isFinite(ny)) {
        const newFlash: ImpactFlash = {
          id: impactIdRef.current++,
          x: nx,
          y: ny,
        };
        setImpactFlashes((prev) => [...prev.slice(-12), newFlash]);
        const timeoutId = window.setTimeout(() => {
          setImpactFlashes((prev) => prev.filter((flash) => flash.id !== newFlash.id));
          flashTimeoutsRef.current.delete(newFlash.id);
        }, 500);
        flashTimeoutsRef.current.set(newFlash.id, timeoutId);
      }

      const weaponKey = weaponId as WeaponId;
      if (weaponKey === 1 || weaponKey === 2 || weaponKey === 3) {
        const tracker = hitsTrackerRef.current;
        tracker.byWeapon[weaponKey] = (tracker.byWeapon[weaponKey] ?? 0) + 1;
        const threshold = WEAPON_TRIGGER_THRESHOLDS[weaponKey];
        if (!enemyHit && threshold && tracker.byWeapon[weaponKey] >= threshold) {
          setEnemyHit(true);
          tracker.byWeapon = { 1: 0, 2: 0, 3: 0 };
        }
      }
    },
    [enemyHit, isPointInsideMask, onValidHit],
  );

  useEffect(() => {
    if (!hitEvent) return;
    registerHit(hitEvent);
  }, [hitEvent?.id, registerHit, hitEvent]);

  return (
    <div
      className={`absolute inset-0 ${className}`}
      style={{ pointerEvents, ...style }}
    >
      <video
        ref={videoRef}
        className="w-full h-full object-cover"
        src={backgroundSrc}
        playsInline
        muted
        loop
      />
      <ReactionVideoOverlay
        isVisible={reactionOverlayVisible}
        videoRef={reactionVideoRef}
        onEnded={() => {
          if (reactionTimeoutRef.current) {
            window.clearTimeout(reactionTimeoutRef.current);
            reactionTimeoutRef.current = null;
          }
          setEnemyHit(false);
        }}
        opacity={reactionOpacity}
        src={reactionSrc}
      />
      <HitFlashOverlay flashKey={hitFlashKey} silhouetteSrc={silhouetteSrc} />
      <ImpactFlashLayer flashes={impactFlashes} />
      {showDebugGrid && <DebugGridOverlay />}
    </div>
  );
}
