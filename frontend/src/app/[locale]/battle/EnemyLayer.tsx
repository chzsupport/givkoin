'use client';

import React, {
    useCallback,
    useEffect,
    useRef,
    useState,
    useImperativeHandle,
    forwardRef,
    type CSSProperties,
} from 'react';
import type { EnemyHitEvent } from './enemyZones';
import {
    ENEMY_ZONES,
    getZoneNormalizedBounds,
    isPointWithinOutline,
    normalizePointToOutline,
} from './enemyZones';

type WeaponId = 1 | 2 | 3;

type MaskSampler = {
    width: number;
    height: number;
    data: Uint8ClampedArray;
};

type ImpactFlash = {
    id: number;
    x: number;
    y: number;
    at: number;
};

export type EnemyLayerHit = EnemyHitEvent & { id: number };

const WEAPON_TRIGGER_THRESHOLDS: Record<WeaponId, number> = {
    1: 1000,
    2: 200,
    3: 1,
};

const SILHOUETTE_SCALE = (40131 / 80000) * 0.98 * 0.95;
const SILHOUETTE_OFFSET_X_PERCENT = 1;
const SILHOUETTE_OFFSET_Y_PERCENT = -31;
const SILHOUETTE_TRANSFORM = 'translate(1px, -2px)';
const SILHOUETTE_MASK_SIZE = `${SILHOUETTE_SCALE * 100}% ${SILHOUETTE_SCALE * 100}%`;
const SILHOUETTE_MASK_POSITION = `calc(50% + ${SILHOUETTE_OFFSET_X_PERCENT}%) calc(50% + ${SILHOUETTE_OFFSET_Y_PERCENT}%)`;
const REACTION_FADE_DURATION_MS = 600;
const VIDEO_ASPECT_RATIO = 16 / 9;
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
}

@keyframes hitFlashPulse {
  0% {
    opacity: 1;
    filter: drop-shadow(0 0 15px #00ffff) drop-shadow(0 0 25px #0099ff);
  }
  100% {
    opacity: 0;
    filter: drop-shadow(0 0 5px #00ffff) drop-shadow(0 0 10px #0099ff);
  }
}`;

type ReactionVideoOverlayProps = {
    isVisible: boolean;
    videoRef: React.MutableRefObject<HTMLVideoElement | null>;
    onEnded: () => void;
    onError?: () => void;
    opacity: number;
    src: string;
};

function ReactionVideoOverlay({
    isVisible,
    videoRef,
    onEnded,
    onError,
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
                preload="metadata"
                onEnded={onEnded}
                onError={onError}
            />
        </div>
    );
}

function ImpactFlashLayer({ flashes }: { flashes: ImpactFlash[] }) {
    if (flashes.length === 0) return null;
    return (
        <div className="absolute inset-0 z-15 pointer-events-none">
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
    if (ENEMY_ZONES.length === 0 || flashKey === 0) return null;

    const maskUrl = `url("${silhouetteSrc}")`;
    const outlineStyle: CSSProperties = {
        WebkitMaskImage: maskUrl,
        maskImage: maskUrl,
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskSize: SILHOUETTE_MASK_SIZE,
        maskSize: SILHOUETTE_MASK_SIZE,
        WebkitMaskPosition: SILHOUETTE_MASK_POSITION,
        maskPosition: SILHOUETTE_MASK_POSITION,
        background: 'transparent',
        boxShadow: `
      inset 0 0 0 4px #00ffff,
      inset 0 0 30px 5px #00ffff,
      0 0 15px #00ffff,
      0 0 25px #0099ff
    `,
        mixBlendMode: 'screen',
        animation: 'hitFlashPulse 300ms ease-out forwards',
    };

    // key={flashKey} forces React to remount the component, restarting the CSS animation
    return (
        <div key={flashKey} className="absolute inset-0 z-16 pointer-events-none" style={{ transform: SILHOUETTE_TRANSFORM }}>
            <div className="w-full h-full" style={outlineStyle} />
        </div>
    );
}

function SilhouettePositioningOverlay({ silhouetteSrc }: { silhouetteSrc: string }) {
    const maskUrl = `url("${silhouetteSrc}")`;
    const style: CSSProperties = {
        WebkitMaskImage: maskUrl,
        maskImage: maskUrl,
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskSize: SILHOUETTE_MASK_SIZE,
        maskSize: SILHOUETTE_MASK_SIZE,
        WebkitMaskPosition: SILHOUETTE_MASK_POSITION,
        maskPosition: SILHOUETTE_MASK_POSITION,
        backgroundColor: '#9efcff',
        opacity: 0.42,
        mixBlendMode: 'screen',
        filter: 'drop-shadow(0 0 8px rgba(180,255,255,0.82)) drop-shadow(0 0 18px rgba(70,160,255,0.6))',
    };

    return (
        <div className="absolute inset-0 z-12 pointer-events-none" style={{ transform: SILHOUETTE_TRANSFORM }}>
            <div className="w-full h-full" style={style} />
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
    onValidHit?: (event: EnemyHitEvent) => void;
    intensity?: number;
    backgroundSrc?: string;
    reactionSrc?: string;
    silhouetteSrc?: string;
    performanceTier?: 'low' | 'medium' | 'high';
    pointerEvents?: CSSProperties['pointerEvents'];
    className?: string;
    style?: CSSProperties;
    showDebugGrid?: boolean;
    weakZone?: { active: boolean; center: { x: number; y: number; z: number } | null; radius: number } | null;
}

export interface EnemyLayerHandle {
    isPointInsideMask: (worldX: number, worldY: number) => boolean;
    registerHit: (event: EnemyLayerHit) => void;
}

export const EnemyLayer = React.memo(forwardRef<EnemyLayerHandle, EnemyLayerProps>(({
    onValidHit,
    backgroundSrc = '/relax.mp4',
    reactionSrc = '/atack.mp4',
    silhouetteSrc = '/qwer1.svg',
    performanceTier = 'high',
    pointerEvents = 'none',
    className = '',
    style,
    showDebugGrid = false,
    weakZone = null,
}, ref) => {
    const [enemyHit, setEnemyHit] = useState(false);
    const [hitFlashKey, setHitFlashKey] = useState(0);
    const [impactFlashes, setImpactFlashes] = useState<ImpactFlash[]>([]);
    const [reactionOverlayVisible, setReactionOverlayVisible] = useState(false);
    const [reactionOpacity, setReactionOpacity] = useState(0);
    const [backgroundVideoFailed, setBackgroundVideoFailed] = useState(false);
    const [reactionVideoFailed, setReactionVideoFailed] = useState(false);
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
    const impactQueueRef = useRef<ImpactFlash[]>([]);
    const impactFlushTimerRef = useRef<number | null>(null);
    const isLowTier = performanceTier === 'low';
    const disableBackgroundVideo = false;
    const disableReactionVideo = isLowTier;

    const mapPointToCoverContainer = useCallback((worldX: number, worldY: number) => {
        const { nx, ny } = normalizePointToOutline(worldX, worldY);
        if (!Number.isFinite(nx) || !Number.isFinite(ny)) return null;
        if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return null;

        if (typeof window === 'undefined') {
            return { nx, ny, topBasedY: 1 - ny };
        }

        const viewportWidth = window.innerWidth || 0;
        const viewportHeight = window.innerHeight || 0;
        if (viewportWidth <= 0 || viewportHeight <= 0) {
            return { nx, ny, topBasedY: 1 - ny };
        }

        const viewportAspect = viewportWidth / viewportHeight;
        let coverWidthRatio = 1;
        let coverHeightRatio = 1;

        if (viewportAspect > VIDEO_ASPECT_RATIO) {
            coverHeightRatio = viewportAspect / VIDEO_ASPECT_RATIO;
        } else if (viewportAspect > 0) {
            coverWidthRatio = VIDEO_ASPECT_RATIO / viewportAspect;
        }

        const croppedX = (coverWidthRatio - 1) / 2;
        const croppedY = (coverHeightRatio - 1) / 2;
        const coverX = (nx + croppedX) / coverWidthRatio;
        const coverTopBasedY = ((1 - ny) + croppedY) / coverHeightRatio;

        if (!Number.isFinite(coverX) || !Number.isFinite(coverTopBasedY)) return null;
        if (coverX < 0 || coverX > 1 || coverTopBasedY < 0 || coverTopBasedY > 1) return null;

        return {
            nx: coverX,
            ny: 1 - coverTopBasedY,
            topBasedY: coverTopBasedY,
        };
    }, []);

    const mapPointToSilhouette = useCallback((worldX: number, worldY: number) => {
        const coverPoint = mapPointToCoverContainer(worldX, worldY);
        if (!coverPoint) return null;

        // CSS mask-position проценты считаются от свободного места, а не от всего экрана.
        // Здесь повторяем ту же математику, чтобы попадание совпадало с тем, что видно.
        const freeSpace = 1 - SILHOUETTE_SCALE;
        const left = freeSpace * (0.5 + (SILHOUETTE_OFFSET_X_PERCENT / 100));
        const top = freeSpace * (0.5 + (SILHOUETTE_OFFSET_Y_PERCENT / 100));
        const localX = (coverPoint.nx - left) / SILHOUETTE_SCALE;
        const localYFromTop = (coverPoint.topBasedY - top) / SILHOUETTE_SCALE;

        if (localX < 0 || localX > 1 || localYFromTop < 0 || localYFromTop > 1) {
            return null;
        }

        return { nx: coverPoint.nx, ny: coverPoint.ny, localX, localY: 1 - localYFromTop };
    }, [mapPointToCoverContainer]);

    useEffect(() => {
        if (reactionVideoRef.current) {
            reactionVideoRef.current.muted = true;
        }
        if (videoRef.current && !disableBackgroundVideo) {
            const backgroundVideo = videoRef.current;
            backgroundVideo.loop = true;
            backgroundVideo.muted = true;
            const syncVisibilityPlayback = () => {
                if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
                    backgroundVideo.pause();
                    reactionVideoRef.current?.pause();
                    return;
                }
                if (backgroundVideo.paused) {
                    backgroundVideo.play().catch(() => {
                        /* autoplay guard */
                    });
                }
            };
            const playbackWatchdog = window.setTimeout(() => {
                const video = backgroundVideo;
                if (!video) return;
                if (video.readyState < 2) {
                    setBackgroundVideoFailed(true);
                }
            }, 3500);

            syncVisibilityPlayback();
            const handleReady = () => {
                window.clearTimeout(playbackWatchdog);
            };
            backgroundVideo.addEventListener('loadeddata', handleReady);
            backgroundVideo.addEventListener('playing', handleReady);
            document.addEventListener('visibilitychange', syncVisibilityPlayback);

            return () => {
                window.clearTimeout(playbackWatchdog);
                backgroundVideo.removeEventListener('loadeddata', handleReady);
                backgroundVideo.removeEventListener('playing', handleReady);
                document.removeEventListener('visibilitychange', syncVisibilityPlayback);
                if (reactionTimeoutRef.current) window.clearTimeout(reactionTimeoutRef.current);
                if (reactionFadeTimeoutRef.current) window.clearTimeout(reactionFadeTimeoutRef.current);
                if (reactionOpacityRafRef.current) window.cancelAnimationFrame(reactionOpacityRafRef.current);
                if (impactFlushTimerRef.current) window.clearTimeout(impactFlushTimerRef.current);
                impactFlushTimerRef.current = null;
                impactQueueRef.current = [];
            };
        }
        return () => {
            if (reactionTimeoutRef.current) window.clearTimeout(reactionTimeoutRef.current);
            if (reactionFadeTimeoutRef.current) window.clearTimeout(reactionFadeTimeoutRef.current);
            if (reactionOpacityRafRef.current) window.cancelAnimationFrame(reactionOpacityRafRef.current);
            if (impactFlushTimerRef.current) window.clearTimeout(impactFlushTimerRef.current);
            impactFlushTimerRef.current = null;
            impactQueueRef.current = [];
        };
    }, [disableBackgroundVideo]);

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

    const isPointInsideSilhouette = useCallback((worldX: number, worldY: number) => {
        const sampler = maskSamplerRef.current;
        if (!sampler) return false;
        const { width, height, data } = sampler;

        const point = mapPointToSilhouette(worldX, worldY);
        if (!point) return false;

        // Convert to pixel coordinates in the mask image
        const px = Math.min(width - 1, Math.max(0, Math.round(point.localX * (width - 1))));
        // Note: ny=0 is bottom in 3D world but top=0 in image, so we flip
        const py = Math.min(height - 1, Math.max(0, Math.round((1 - point.localY) * (height - 1))));

        const index = (py * width + px) * 4;
        const alpha = data[index + 3];

        // Alpha > 16 means there's visible content at this pixel
        return alpha > 16;
    }, [mapPointToSilhouette]);

    const isPointInsideMask = useCallback((worldX: number, worldY: number) => {
        return isPointInsideSilhouette(worldX, worldY);
    }, [isPointInsideSilhouette]);

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
            if (
                videoRef.current &&
                videoRef.current.paused &&
                (typeof document === 'undefined' || document.visibilityState !== 'hidden')
            ) {
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
                                setReactionVideoFailed(true);
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

            // Logic: Track hits for reaction video (Always run this)
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

            // Use normalized coordinates which now map to full screen
            const coverPoint = mapPointToCoverContainer(worldPoint.x, worldPoint.y);

            if (coverPoint) {
                impactQueueRef.current.push({
                    id: impactIdRef.current++,
                    x: coverPoint.nx,
                    y: coverPoint.ny,
                    at: Date.now(),
                });
            }

            if (impactFlushTimerRef.current != null) {
                return;
            }

            const flushDelayMs = isLowTier ? 120 : 50;
            impactFlushTimerRef.current = window.setTimeout(() => {
                impactFlushTimerRef.current = null;
                const queued = impactQueueRef.current.splice(0);
                if (!queued.length) return;

                const now = Date.now();
                setImpactFlashes((prev) => {
                    const kept = prev.filter((flash) => now - flash.at < 500);
                    const merged = [...kept, ...queued];
                    return merged.slice(-12);
                });
                setHitFlashKey((prev) => prev + 1);
            }, flushDelayMs);
        },
        [enemyHit, isLowTier, isPointInsideMask, mapPointToCoverContainer, onValidHit],
    );

    useImperativeHandle(
        ref,
        () => ({
            isPointInsideMask,
            registerHit,
        }),
        [isPointInsideMask, registerHit]
    );

    return (
        <div
            className={`absolute inset-0 overflow-hidden ${className}`}
            style={{ pointerEvents, ...style }}
        >
            {/* Scaling Container that mimics object-cover */}
            <div
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
                style={{
                    width: `max(100%, calc(100vh * ${VIDEO_ASPECT_RATIO}))`,
                    height: `max(100%, calc(100vw / ${VIDEO_ASPECT_RATIO}))`,
                    aspectRatio: `${VIDEO_ASPECT_RATIO}`,
                }}
            >
                {!disableBackgroundVideo && (
                    <video
                        ref={videoRef}
                        className="w-full h-full object-cover"
                        src={backgroundSrc}
                        playsInline
                        muted
                        loop
                        preload="metadata"
                        onError={() => setBackgroundVideoFailed(true)}
                    />
                )}
                {backgroundVideoFailed && (
                    <div className="absolute inset-0 bg-gradient-to-b from-[#050510] via-[#0f0b16] to-black">
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(91,33,182,0.18),rgba(0,0,0,0)_60%)]" />
                    </div>
                )}
                {!disableReactionVideo && (
                    <ReactionVideoOverlay
                        isVisible={reactionOverlayVisible && !reactionVideoFailed}
                        videoRef={reactionVideoRef}
                        onEnded={() => {
                            if (reactionTimeoutRef.current) {
                                window.clearTimeout(reactionTimeoutRef.current);
                                reactionTimeoutRef.current = null;
                            }
                            setEnemyHit(false);
                        }}
                        onError={() => setReactionVideoFailed(true)}
                        opacity={reactionOpacity}
                        src={reactionSrc}
                    />
                )}
                {(reactionVideoFailed || disableReactionVideo) && reactionOverlayVisible && (
                    <div className="absolute inset-0 z-10 pointer-events-none bg-red-500/10" />
                )}
                <HitFlashOverlay flashKey={hitFlashKey} silhouetteSrc={silhouetteSrc} />
                <SilhouettePositioningOverlay silhouetteSrc={silhouetteSrc} />
                <ImpactFlashLayer flashes={impactFlashes} />
                {weakZone?.active && weakZone.center && (() => {
                    if (!isPointInsideSilhouette(weakZone.center.x, weakZone.center.y)) return null;
                    const coverPoint = mapPointToCoverContainer(weakZone.center.x, weakZone.center.y);
                    if (!coverPoint) return null;
                    return (
                        <div
                            className="absolute z-18 pointer-events-none"
                            style={{
                                left: `${coverPoint.nx * 100}%`,
                                top: `${(1 - coverPoint.ny) * 100}%`,
                                transform: 'translate(-50%, -50%)',
                            }}
                        >
                            <div
                                className="animate-pulse"
                                style={{
                                    width: `${weakZone.radius * 2}px`,
                                    height: `${weakZone.radius * 2}px`,
                                    borderRadius: '9999px',
                                    background: 'radial-gradient(circle, rgba(255,255,255,0.25) 0%, rgba(255,0,255,0.12) 45%, rgba(255,0,255,0) 70%)',
                                    border: '1px solid rgba(255,0,255,0.45)',
                                    boxShadow: '0 0 25px rgba(255,0,255,0.35)',
                                }}
                            />
                        </div>
                    );
                })()}
                {showDebugGrid && <DebugGridOverlay />}
            </div>
        </div>
    );
}));

EnemyLayer.displayName = 'EnemyLayer';


