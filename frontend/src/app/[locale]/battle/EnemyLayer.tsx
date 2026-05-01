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
import {
    BATTLE_VIDEO_ASPECT_RATIO,
    getBattleSilhouetteLayout,
    getBattleViewportLayout,
    type BattleSceneLayout,
} from './battleLayout';

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

const REACTION_FADE_DURATION_MS = 600;
const REACTION_RETRY_DELAY_MS = 250;
const MAX_REACTION_RETRIES = 3;
const IMPACT_FLASH_DURATION_MS = 650;
const MAX_IMPACT_FLASHES = 24;
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
                preload="auto"
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
                            willChange: 'transform, opacity',
                        }}
                    />
                </div>
            ))}
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
    layout?: BattleSceneLayout;
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
    silhouetteSrc = '/qwer1-frame.svg',
    layout,
    performanceTier = 'high',
    pointerEvents = 'none',
    className = '',
    style,
    showDebugGrid = false,
    weakZone = null,
}, ref) => {
    const [enemyHit, setEnemyHit] = useState(false);
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
    const reactionRetryTimeoutRef = useRef<number | null>(null);
    const hitsTrackerRef = useRef<{ byWeapon: Record<WeaponId, number> }>({
        byWeapon: { 1: 0, 2: 0, 3: 0 },
    });
    const maskSamplerRef = useRef<MaskSampler | null>(null);
    const impactIdRef = useRef(0);
    const impactQueueRef = useRef<ImpactFlash[]>([]);
    const impactFlushFrameRef = useRef<number | null>(null);
    const isLowTier = performanceTier === 'low';
    const disableBackgroundVideo = false;

    const resolveViewportLayout = useCallback(() => {
        if (layout?.viewport) {
            return layout.viewport;
        }
        if (typeof window === 'undefined') {
            return getBattleViewportLayout();
        }
        return getBattleViewportLayout(window.innerWidth, window.innerHeight);
    }, [layout]);

    const mapPointToVideoContainer = useCallback((worldX: number, worldY: number) => {
        const { nx, ny } = normalizePointToOutline(worldX, worldY);
        if (!Number.isFinite(nx) || !Number.isFinite(ny)) return null;
        if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return null;

        const viewport = resolveViewportLayout();
        if (!viewport.width || !viewport.height) {
            return { nx, ny, topBasedY: 1 - ny };
        }

        const frameX = ((nx * viewport.width) - viewport.frameLeft) / viewport.frameWidth;
        const frameTopBasedY = (((1 - ny) * viewport.height) - viewport.frameTop) / viewport.frameHeight;

        if (!Number.isFinite(frameX) || !Number.isFinite(frameTopBasedY)) return null;
        if (frameX < 0 || frameX > 1 || frameTopBasedY < 0 || frameTopBasedY > 1) return null;

        return {
            nx: frameX,
            ny: 1 - frameTopBasedY,
            topBasedY: frameTopBasedY,
        };
    }, [resolveViewportLayout]);

    const mapPointToSilhouette = useCallback((worldX: number, worldY: number) => {
        const videoPoint = mapPointToVideoContainer(worldX, worldY);
        if (!videoPoint) return null;

        const viewport = resolveViewportLayout();
        const silhouette = layout?.silhouette ?? getBattleSilhouetteLayout(viewport);
        const pointPxX = silhouette.leftPx + (videoPoint.nx * silhouette.widthPx);
        const pointPxY = silhouette.topPx + (videoPoint.topBasedY * silhouette.heightPx);
        const localX = (pointPxX - silhouette.leftPx) / silhouette.widthPx;
        const localYFromTop = (pointPxY - silhouette.topPx) / silhouette.heightPx;

        if (localX < 0 || localX > 1 || localYFromTop < 0 || localYFromTop > 1) {
            return null;
        }

        return { nx: videoPoint.nx, ny: videoPoint.ny, localX, localY: 1 - localYFromTop };
    }, [layout, mapPointToVideoContainer, resolveViewportLayout]);

    useEffect(() => {
        if (reactionVideoRef.current) {
            reactionVideoRef.current.muted = true;
        }
        if (videoRef.current && !disableBackgroundVideo) {
            const backgroundVideo = videoRef.current;
            backgroundVideo.loop = true;
            backgroundVideo.muted = true;
            setBackgroundVideoFailed(false);
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
            const softRetryDelayMs = isLowTier ? 11000 : performanceTier === 'medium' ? 9000 : 7000;
            const hardFallbackDelayMs = isLowTier ? 24000 : performanceTier === 'medium' ? 18000 : 15000;
            const requestVideoRetry = () => {
                const video = backgroundVideo;
                if (!video) return;
                video.load();
                video.play().catch(() => {
                    /* autoplay guard */
                });
            };
            const softRetryTimer = window.setTimeout(() => {
                const video = backgroundVideo;
                if (!video || video.readyState >= 2 || video.error) return;
                if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
                requestVideoRetry();
            }, softRetryDelayMs);
            const hardFallbackTimer = window.setTimeout(() => {
                const video = backgroundVideo;
                if (!video || video.readyState >= 2) return;
                if (video.error || video.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) {
                    setBackgroundVideoFailed(true);
                }
            }, hardFallbackDelayMs);

            syncVisibilityPlayback();
            const handleReady = () => {
                window.clearTimeout(softRetryTimer);
                window.clearTimeout(hardFallbackTimer);
                setBackgroundVideoFailed(false);
            };
            const handleError = () => {
                window.clearTimeout(softRetryTimer);
                window.clearTimeout(hardFallbackTimer);
                setBackgroundVideoFailed(true);
            };
            backgroundVideo.addEventListener('loadeddata', handleReady);
            backgroundVideo.addEventListener('canplay', handleReady);
            backgroundVideo.addEventListener('playing', handleReady);
            backgroundVideo.addEventListener('error', handleError);
            document.addEventListener('visibilitychange', syncVisibilityPlayback);

            return () => {
                window.clearTimeout(softRetryTimer);
                window.clearTimeout(hardFallbackTimer);
                backgroundVideo.removeEventListener('loadeddata', handleReady);
                backgroundVideo.removeEventListener('canplay', handleReady);
                backgroundVideo.removeEventListener('playing', handleReady);
                backgroundVideo.removeEventListener('error', handleError);
                document.removeEventListener('visibilitychange', syncVisibilityPlayback);
                if (reactionTimeoutRef.current) window.clearTimeout(reactionTimeoutRef.current);
                if (reactionFadeTimeoutRef.current) window.clearTimeout(reactionFadeTimeoutRef.current);
                if (reactionOpacityRafRef.current) window.cancelAnimationFrame(reactionOpacityRafRef.current);
                if (reactionRetryTimeoutRef.current) window.clearTimeout(reactionRetryTimeoutRef.current);
                if (impactFlushFrameRef.current) window.cancelAnimationFrame(impactFlushFrameRef.current);
                reactionRetryTimeoutRef.current = null;
                impactFlushFrameRef.current = null;
                impactQueueRef.current = [];
            };
        }
        return () => {
            if (reactionTimeoutRef.current) window.clearTimeout(reactionTimeoutRef.current);
            if (reactionFadeTimeoutRef.current) window.clearTimeout(reactionFadeTimeoutRef.current);
            if (reactionOpacityRafRef.current) window.cancelAnimationFrame(reactionOpacityRafRef.current);
            if (reactionRetryTimeoutRef.current) window.clearTimeout(reactionRetryTimeoutRef.current);
            if (impactFlushFrameRef.current) window.cancelAnimationFrame(impactFlushFrameRef.current);
            reactionRetryTimeoutRef.current = null;
            impactFlushFrameRef.current = null;
            impactQueueRef.current = [];
        };
    }, [disableBackgroundVideo, isLowTier, performanceTier]);

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
            setReactionVideoFailed(false);
            setReactionOpacity(0);
            if (reactionRetryTimeoutRef.current) {
                window.clearTimeout(reactionRetryTimeoutRef.current);
                reactionRetryTimeoutRef.current = null;
            }
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
        setReactionVideoFailed(false);

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

        const clearRetryTimer = () => {
            if (reactionRetryTimeoutRef.current) {
                window.clearTimeout(reactionRetryTimeoutRef.current);
                reactionRetryTimeoutRef.current = null;
            }
        };

        const attemptPlay = (attempt = 0) => {
            reactionVideo.pause();
            reactionVideo.currentTime = 0;
            reactionVideo.load();
            const promise = reactionVideo.play();
            if (promise && typeof promise.then === 'function') {
                promise
                    .then(() => {
                        clearRetryTimer();
                        scheduleAutoReset();
                    })
                    .catch(() => {
                        if (attempt >= MAX_REACTION_RETRIES) {
                            setReactionVideoFailed(true);
                            clearRetryTimer();
                            clearTimer();
                            setEnemyHit(false);
                            return;
                        }
                        clearRetryTimer();
                        reactionRetryTimeoutRef.current = window.setTimeout(() => {
                            attemptPlay(attempt + 1);
                        }, REACTION_RETRY_DELAY_MS);
                    });
            } else {
                clearRetryTimer();
                scheduleAutoReset();
            }
        };

        attemptPlay();
        return () => {
            clearRetryTimer();
            clearTimer();
        };
    }, [enemyHit]);

    const flushQueuedImpacts = useCallback(() => {
        impactFlushFrameRef.current = null;
        const queued = impactQueueRef.current.splice(0);
        if (!queued.length) return;

        const now = Date.now();
        setImpactFlashes((prev) => {
            const kept = prev.filter((flash) => now - flash.at < IMPACT_FLASH_DURATION_MS);
            const merged = [...kept, ...queued];
            return merged.slice(-MAX_IMPACT_FLASHES);
        });
    }, []);

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

            const videoPoint = mapPointToVideoContainer(worldPoint.x, worldPoint.y);

            if (videoPoint) {
                impactQueueRef.current.push({
                    id: impactIdRef.current++,
                    x: videoPoint.nx,
                    y: videoPoint.ny,
                    at: Date.now(),
                });
            }

            if (impactFlushFrameRef.current != null) {
                return;
            }

            impactFlushFrameRef.current = window.requestAnimationFrame(flushQueuedImpacts);
        },
        [enemyHit, flushQueuedImpacts, isPointInsideMask, mapPointToVideoContainer, onValidHit],
    );

    const viewportLayout = resolveViewportLayout();
    const silhouetteLayout = layout?.silhouette ?? getBattleSilhouetteLayout(viewportLayout);

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
            {/* Shared 16:9 frame for both the video and the silhouette */}
            <div
                className="absolute overflow-hidden"
                style={{
                    left: `${viewportLayout.frameLeft}px`,
                    top: `${viewportLayout.frameTop}px`,
                    width: `${viewportLayout.frameWidth}px`,
                    height: `${viewportLayout.frameHeight}px`,
                    aspectRatio: `${BATTLE_VIDEO_ASPECT_RATIO}`,
                }}
            >
                {!disableBackgroundVideo && (
                    <video
                        ref={videoRef}
                        className="w-full h-full object-contain"
                        src={backgroundSrc}
                        playsInline
                        muted
                        loop
                        preload="auto"
                        onError={() => setBackgroundVideoFailed(true)}
                    />
                )}
                {backgroundVideoFailed && (
                    <div className="absolute inset-0 bg-gradient-to-b from-[#050510] via-[#0f0b16] to-black">
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(91,33,182,0.18),rgba(0,0,0,0)_60%)]" />
                    </div>
                )}
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
                    onError={() => {
                        const video = reactionVideoRef.current;
                        if (!video) return;
                        video.load();
                        video.play().catch(() => {
                            /* retry path is handled by the enemyHit effect */
                        });
                    }}
                    opacity={reactionOpacity}
                    src={reactionSrc}
                />
                <div
                    className="absolute z-14 pointer-events-none"
                    style={{
                        left: `${silhouetteLayout.leftPx}px`,
                        top: `${silhouetteLayout.topPx}px`,
                        width: `${silhouetteLayout.widthPx}px`,
                        height: `${silhouetteLayout.heightPx}px`,
                        opacity: 0.72,
                        mixBlendMode: 'screen',
                    }}
                >
                    <img
                        src={silhouetteSrc}
                        alt=""
                        aria-hidden="true"
                        className="w-full h-full select-none"
                        draggable={false}
                        style={{
                            objectFit: 'fill',
                            filter:
                                'brightness(0) invert(1) drop-shadow(0 0 14px rgba(255,255,255,0.42)) drop-shadow(0 0 26px rgba(120,220,255,0.28))',
                        }}
                    />
                </div>
                <ImpactFlashLayer flashes={impactFlashes} />
                {weakZone?.active && weakZone.center && (() => {
                    if (!isPointInsideSilhouette(weakZone.center.x, weakZone.center.y)) return null;
                    const videoPoint = mapPointToVideoContainer(weakZone.center.x, weakZone.center.y);
                    if (!videoPoint) return null;
                    return (
                        <div
                            className="absolute z-18 pointer-events-none"
                            style={{
                                left: `${videoPoint.nx * 100}%`,
                                top: `${(1 - videoPoint.ny) * 100}%`,
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


