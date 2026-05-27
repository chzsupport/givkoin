'use client';

import React from 'react';
import { ENEMY_ZONES, getZoneNormalizedBounds } from './enemyZones';

export type ImpactFlash = {
    id: number;
    x: number;
    y: number;
    at: number;
};

export const REACTION_FADE_DURATION_MS = 600;
export const IMPACT_FLASH_DURATION_MS = 650;

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

export function ReactionVideoOverlay({
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

export function ImpactFlashLayer({ flashes }: { flashes: ImpactFlash[] }) {
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

export function DebugGridOverlay() {
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
