'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ENTITY_FAQ } from '@/constants/entityFaq';
import { getLocalizedText } from '@/i18n/localizedContent';
import { useI18n } from '@/context/I18nContext';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  entityName?: string;
};

export function EntityAskModal({ isOpen, onClose, entityName }: Props) {
  const { language, t } = useI18n();
  const title = useMemo(() => entityName || t('entity.default_name'), [entityName, t]);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setOpenIndex(null);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-3 sm:p-6"
          onMouseDown={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            className="w-full max-w-5xl h-[90vh] sm:h-[85vh] rounded-2xl border border-white/10 bg-neutral-900/95 shadow-2xl overflow-hidden flex flex-col"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-4 sm:py-5 border-b border-white/10">
              <div className="min-w-0">
                <div className="text-tiny uppercase tracking-widest text-neutral-500">{t('entity.learn_about')}</div>
                <div className="text-secondary sm:text-lg font-bold text-white truncate">{title}</div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-3 py-2 sm:px-4 sm:py-3 text-white/60 hover:text-white hover:bg-red-500/20 transition-colors font-bold"
                aria-label={t('common.close')}
              >
                ✕
              </button>
            </div>

            <div className="px-4 sm:px-6 py-4 flex flex-col flex-1 min-h-0">
              <div className="h-full overflow-y-auto rounded-xl border border-white/10 bg-black/30 p-4 sm:p-5 space-y-3">
                {ENTITY_FAQ.map((item, idx) => {
                  const isOpenItem = openIndex === idx;
                  return (
                    <div key={idx} className="border border-white/10 rounded-xl overflow-hidden bg-white/5">
                      <button
                        type="button"
                        onClick={() => setOpenIndex((prev) => (prev === idx ? null : idx))}
                        className="w-full text-left px-4 sm:px-5 py-3 sm:py-4 flex items-center justify-between gap-3 hover:bg-white/5 transition-colors"
                      >
                        <div className="text-sm sm:text-base font-bold text-white/90 leading-snug">{getLocalizedText(item.q, language)}</div>
                        <div className="text-white/50 text-base sm:text-lg shrink-0">{isOpenItem ? '−' : '+'}</div>
                      </button>
                      <AnimatePresence initial={false}>
                        {isOpenItem && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.18 }}
                            className="px-4 sm:px-5 pb-4"
                          >
                            <div className="text-sm sm:text-base text-white/80 leading-relaxed whitespace-pre-wrap">
                              {getLocalizedText(item.a, language)}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
