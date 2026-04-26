'use client';

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

type ToastVariant = 'success' | 'error' | 'info';

type ToastItem = {
  id: string;
  title: string;
  message?: string;
  variant: ToastVariant;
};

type ToastContextValue = {
  push: (toast: { title: string; message?: string; variant?: ToastVariant }) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
};

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Record<string, number>>({});

  const remove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timers = timersRef.current;
    if (timers[id]) {
      window.clearTimeout(timers[id]);
      delete timers[id];
    }
  }, []);

  const push = useCallback((toast: { title: string; message?: string; variant?: ToastVariant }) => {
    const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const item: ToastItem = {
      id,
      title: toast.title,
      message: toast.message,
      variant: toast.variant || 'info',
    };

    setToasts((prev) => [item, ...prev].slice(0, 3));

    timersRef.current[id] = window.setTimeout(() => {
      remove(id);
    }, 2500);
  }, [remove]);

  const value = useMemo<ToastContextValue>(() => {
    return {
      push,
      success: (title, message) => push({ title, message, variant: 'success' }),
      error: (title, message) => push({ title, message, variant: 'error' }),
      info: (title, message) => push({ title, message, variant: 'info' }),
    };
  }, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div
        className="pointer-events-none"
        style={{ position: 'fixed', bottom: 64, right: 24, zIndex: 10000 }}
      >
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              className="mb-3"
            >
              <div
                className={`pointer-events-auto min-w-[280px] max-w-[90vw] rounded-2xl border backdrop-blur-xl shadow-2xl px-4 py-3 ${t.variant === 'error'
                  ? 'bg-red-950/60 border-red-500/30'
                  : t.variant === 'success'
                    ? 'bg-emerald-950/50 border-emerald-500/20'
                    : 'bg-black/70 border-white/10'
                  }`}
                onClick={() => remove(t.id)}
              >
                <div className={`text-sm font-bold ${t.variant === 'error' ? 'text-red-200' : 'text-white'}`}>{t.title}</div>
                {t.message && (
                  <div className={`text-xs mt-0.5 ${t.variant === 'error' ? 'text-red-200/80' : 'text-white/60'}`}>{t.message}</div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
