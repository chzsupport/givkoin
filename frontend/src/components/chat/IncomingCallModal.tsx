import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, PhoneOff } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useI18n } from '@/context/I18nContext';

interface IncomingCallModalProps {
    isOpen: boolean;
    onAccept: () => void;
    onDecline: () => void;
    title?: string;
    subtitle?: string;
}

export const IncomingCallModal: React.FC<IncomingCallModalProps> = ({
    isOpen,
    onAccept,
    onDecline,
    title,
    subtitle,
}) => {
    const { t } = useI18n();
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [mounted, setMounted] = useState(false);

    const titleText = title ?? t('chat.incoming_call_title');
    const subtitleText = subtitle ?? t('chat.incoming_call_subtitle');

    useEffect(() => {
        setMounted(true);
        return () => setMounted(false);
    }, []);

    useEffect(() => {
        if (isOpen) {
            audioRef.current = new Audio('/incoming-call.mp3');
            audioRef.current.loop = true;
            audioRef.current.play().catch(e => console.error("Audio play failed", e));
        } else {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
        }

        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
        };
    }, [isOpen]);

    if (!mounted) return null;

    const modal = (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
                    <motion.div
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.5, opacity: 0 }}
                        className="bg-gray-900 border border-white/10 rounded-3xl p-8 max-w-sm w-full shadow-2xl flex flex-col items-center"
                    >
                        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center mb-6 animate-pulse">
                            <Phone size={48} className="text-white" />
                        </div>

                        <h2 className="text-2xl font-bold text-white mb-2">{titleText}</h2>
                        <p className="text-gray-400 mb-8 text-center">{subtitleText}</p>

                        <div className="flex gap-4 w-full">
                            <button
                                onClick={onDecline}
                                className="flex-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/50 rounded-xl py-4 flex flex-col items-center gap-2 transition-colors"
                            >
                                <PhoneOff size={24} />
                                <span className="text-sm font-medium">{t('common.reject')}</span>
                            </button>

                            <button
                                onClick={onAccept}
                                className="flex-1 bg-green-500 hover:bg-green-400 text-white rounded-xl py-4 flex flex-col items-center gap-2 transition-colors shadow-lg shadow-green-500/20"
                            >
                                <Phone size={24} />
                                <span className="text-sm font-medium">{t('common.accept')}</span>
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );

    return createPortal(modal, document.body);
};
