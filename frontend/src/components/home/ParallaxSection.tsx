import type { ReactNode } from 'react';

type ParallaxSectionProps = {
    children: ReactNode;
    className?: string;
    id?: string;
};

export function ParallaxSection({ children, className = '', id = '' }: ParallaxSectionProps) {
    return (
        <div id={id} className={`relative flex min-h-screen items-center justify-center p-6 ${className}`}>
            {children}
        </div>
    );
}
