'use client';

import { ReactNode } from 'react';

export default function BlackHoleLayout({ children }: { children: ReactNode }) {
    return (
        <div
            className="fixed inset-0 bg-black text-foreground"
            style={{
                overflow: 'hidden',
                overscrollBehavior: 'none',
            }}
        >
            {children}
        </div>
    );
}
