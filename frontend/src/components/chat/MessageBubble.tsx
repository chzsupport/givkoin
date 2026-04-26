import React from 'react';
import { motion } from 'framer-motion';

interface MessageBubbleProps {
    text: string;
    translatedText?: string;
    isMine: boolean;
    time: string;
    status?: 'sent' | 'delivered' | 'read';
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ text, translatedText, isMine, time, status }) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className={`flex flex-col ${isMine ? 'items-start' : 'items-end'} mb-4`}
        >
            <div
                className={`max-w-[80%] px-4 py-3 rounded-2xl ${isMine
                    ? 'bg-purple-600 text-white rounded-tl-none'
                    : 'bg-gray-800 text-gray-100 rounded-tr-none border border-gray-700'
                    }`}
            >
                <p className="text-body leading-relaxed" data-no-translate>
                    {/* 
                      Если сообщение мое - показываю оригинал (я знаю, что я написал).
                      Если чужое - показываю перевод (если он есть), иначе оригинал (значит он на моем языке).
                    */}
                    {isMine ? text : (translatedText || text)}
                </p>
            </div>
            <div className="flex items-center gap-1 mt-1 px-1">
                <span className="text-tiny text-gray-500">{time}</span>
                {isMine && status && (
                    <span className="text-tiny text-gray-500">
                        {status === 'read' ? '✓✓' : '✓'}
                    </span>
                )}
            </div>
        </motion.div>
    );
};
