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
    isPointWithinOutline,
    normalizePointToOutline,
} from './enemyZones';
import {
    BATTLE_VIDEO_ASPECT_RATIO,
    getBattleHitAreaLayout,
    getBattleSilhouetteLayout,
    getBattleViewportLayout,
    type BattleSceneLayout,
} from './battleLayout';
import {
    DebugGridOverlay,
    ImpactFlashLayer,
    IMPACT_FLASH_DURATION_MS,
    REACTION_FADE_DURATION_MS,
    ReactionVideoOverlay,
    type ImpactFlash,
} from './EnemyLayerOverlays';
import { useEnemyMaskSampler } from './useEnemyMaskSampler';

type WeaponId = 1 | 2 | 3;

export type EnemyLayerHit = EnemyHitEvent & { id: number };

const WEAPON_TRIGGER_THRESHOLDS: Record<WeaponId, number> = {
    1: 1000,
    2: 200,
    3: 1,
};

const REACTION_RETRY_DELAY_MS = 250;
const MAX_REACTION_RETRIES = 3;
const MAX_IMPACT_FLASHES = 24;

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
    silhouetteSrc = '/qwer1.svg',
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

        const hitArea = getBattleHitAreaLayout(viewport);
        const pointPxX = viewport.frameLeft + hitArea.leftPx + (nx * hitArea.widthPx);
        const pointPxY = viewport.frameTop + hitArea.topPx + ((1 - ny) * hitArea.heightPx);
        const frameX = (pointPxX - viewport.frameLeft) / viewport.frameWidth;
        const frameTopBasedY = (pointPxY - viewport.frameTop) / viewport.frameHeight;

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
        const pointPxX = viewport.frameLeft + (videoPoint.nx * viewport.frameWidth);
        const pointPxY = viewport.frameTop + (videoPoint.topBasedY * viewport.frameHeight);
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

    const { isPointInsideMask, isPointInsideSilhouette } = useEnemyMaskSampler({
        silhouetteSrc,
        mapPointToSilhouette,
    });

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
            {/* Shared battle frame for both the video and the silhouette */}
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
                        className="block w-full h-full"
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


