'use client';

import React from 'react';

interface CrosshairProps {
    x: number;
    y: number;
    visible: boolean;
}

export const Crosshair: React.FC<CrosshairProps> = ({ x, y, visible }) => {
    if (!visible) {
        return null;
    }

    return (
        <div
            className="fixed w-6 h-6 pointer-events-none z-[200] transition-opacity duration-200"
            style={{
                left: `${x}px`,
                top: `${y}px`,
                transform: 'translate(-50%, -50%)',
                opacity: visible ? 1 : 0,
            }}
        >
            <div className="absolute top-1/2 left-0 w-full h-px bg-white/70 -translate-y-1/2 shadow-[0_0_3px_white]"></div>
            <div className="absolute top-0 left-1/2 w-px h-full bg-white/70 -translate-x-1/2 shadow-[0_0_3px_white]"></div>
        </div>
    );
};
