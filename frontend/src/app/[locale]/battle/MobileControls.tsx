import React, { useRef, useState } from 'react';

interface MobileControlsProps {
    onAim: (x: number, y: number) => void;
    onFire: (firing: boolean) => void;
}

export const MobileControls: React.FC<MobileControlsProps> = ({ onAim, onFire }) => {
    const leftRef = useRef<HTMLDivElement>(null);
    const rightRef = useRef<HTMLDivElement>(null);
    const [leftStickPosition, setLeftStickPosition] = useState({ x: 0, y: 0 });
    const [rightStickPosition, setRightStickPosition] = useState({ x: 0, y: 0 });
    const [isLeftDragging, setIsLeftDragging] = useState(false);
    const [isRightDragging, setIsRightDragging] = useState(false);
    const leftTouchIdRef = useRef<number | null>(null);
    const rightTouchIdRef = useRef<number | null>(null);
    const leftCenterRef = useRef({ x: 0, y: 0 });
    const rightCenterRef = useRef({ x: 0, y: 0 });

    // Aim Sensitivity
    const SENSITIVITY = 1.0;

    const getStickPosition = (touch: { clientX: number; clientY: number }, center: { x: number; y: number }, maxDist = 50) => {
        const dx = touch.clientX - center.x;
        const dy = touch.clientY - center.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const clampedDist = Math.min(distance, maxDist);
        const angle = Math.atan2(dy, dx);
        return {
            x: Math.cos(angle) * clampedDist,
            y: Math.sin(angle) * clampedDist,
            maxDist,
        };
    };

    const handleLeftTouchStart = (e: React.TouchEvent) => {
        e.preventDefault();
        const touch = e.changedTouches[0];
        leftTouchIdRef.current = touch.identifier;
        setIsLeftDragging(true);

        if (leftRef.current) {
            const rect = leftRef.current.getBoundingClientRect();
            leftCenterRef.current = {
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2
            };
        }
    };

    const handleLeftTouchMove = (e: React.TouchEvent) => {
        e.preventDefault();
        if (!isLeftDragging) return;

        const touch = Array.from(e.changedTouches).find(t => t.identifier === leftTouchIdRef.current);
        if (!touch) return;

        const { x: stickX, y: stickY, maxDist } = getStickPosition(touch, leftCenterRef.current);
        setLeftStickPosition({ x: stickX, y: stickY });

        const normX = (stickX / maxDist) * SENSITIVITY;
        const normY = -(stickY / maxDist) * SENSITIVITY; // Invert Y for screen coords

        onAim(normX, normY);
    };

    const handleLeftTouchEnd = (e: React.TouchEvent) => {
        e.preventDefault();
        const touch = Array.from(e.changedTouches).find(t => t.identifier === leftTouchIdRef.current);
        if (touch) {
            setIsLeftDragging(false);
            setLeftStickPosition({ x: 0, y: 0 });
            leftTouchIdRef.current = null;
        }
    };

    const handleRightTouchStart = (e: React.TouchEvent) => {
        e.preventDefault();
        const touch = e.changedTouches[0];
        rightTouchIdRef.current = touch.identifier;
        setIsRightDragging(true);
        onFire(true);

        if (rightRef.current) {
            const rect = rightRef.current.getBoundingClientRect();
            rightCenterRef.current = {
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2
            };
        }
    };

    const handleRightTouchMove = (e: React.TouchEvent) => {
        e.preventDefault();
        if (!isRightDragging) return;
        const touch = Array.from(e.changedTouches).find(t => t.identifier === rightTouchIdRef.current);
        if (!touch) return;
        const { x, y } = getStickPosition(touch, rightCenterRef.current);
        setRightStickPosition({ x, y });
        onFire(true);
    };

    const handleRightTouchEnd = (e: React.TouchEvent) => {
        e.preventDefault();
        const touch = Array.from(e.changedTouches).find(t => t.identifier === rightTouchIdRef.current);
        if (touch) {
            setIsRightDragging(false);
            setRightStickPosition({ x: 0, y: 0 });
            rightTouchIdRef.current = null;
            onFire(false);
        }
    };

    return (
        <div className="absolute inset-0 z-[100] pointer-events-none lg:hidden touch-none">
            {/* Left Joystick - Aiming - Positioned near tree foundation (left side) */}
            <div
                className="absolute left-[16%] w-24 h-24 sm:w-32 sm:h-32 bg-white/10 rounded-full border border-white/20 backdrop-blur-sm pointer-events-auto touch-none -translate-x-1/2"
                style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 5.25rem)' }}
                onTouchStart={handleLeftTouchStart}
                onTouchMove={handleLeftTouchMove}
                onTouchEnd={handleLeftTouchEnd}
                onTouchCancel={handleLeftTouchEnd}
                ref={leftRef}
            >
                {/* Stick */}
                <div
                    className="absolute w-12 h-12 bg-white/50 rounded-full shadow-lg"
                    style={{
                        top: '50%',
                        left: '50%',
                        transform: `translate(calc(-50% + ${leftStickPosition.x}px), calc(-50% + ${leftStickPosition.y}px))`
                    }}
                />
            </div>

            {/* Right Fire Stick */}
            <div
                className="absolute right-[16%] w-24 h-24 sm:w-32 sm:h-32 bg-red-500/20 rounded-full border-2 border-red-400/40 backdrop-blur-sm pointer-events-auto touch-none translate-x-1/2"
                style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 5.25rem)' }}
                onTouchStart={handleRightTouchStart}
                onTouchMove={handleRightTouchMove}
                onTouchEnd={handleRightTouchEnd}
                onTouchCancel={handleRightTouchEnd}
                ref={rightRef}
            >
                <div
                    className={`absolute w-12 h-12 rounded-full shadow-[0_0_18px_rgba(255,0,0,0.55)] ${isRightDragging ? 'bg-red-500/90' : 'bg-red-500/65'}`}
                    style={{
                        top: '50%',
                        left: '50%',
                        transform: `translate(calc(-50% + ${rightStickPosition.x}px), calc(-50% + ${rightStickPosition.y}px))`
                    }}
                />
            </div>
        </div>
    );
};
