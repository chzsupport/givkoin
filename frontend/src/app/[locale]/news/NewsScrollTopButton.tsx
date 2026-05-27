'use client';

import { ArrowUp } from 'lucide-react';

type NewsScrollTopButtonProps = {
    onClick: () => void;
    show: boolean;
    title: string;
};

export function NewsScrollTopButton({
    onClick,
    show,
    title,
}: NewsScrollTopButtonProps) {
    return (
        <button
            onClick={onClick}
            className={`fixed bottom-6 right-6 z-[9999] cursor-pointer p-3 bg-white/10 hover:bg-white/20 border border-white/10 rounded-full backdrop-blur-md text-white shadow-lg transition-all duration-300 transform active:scale-95 ${show ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-10 pointer-events-none'}`}
            title={title}
        >
            <ArrowUp size={24} />
        </button>
    );
}
