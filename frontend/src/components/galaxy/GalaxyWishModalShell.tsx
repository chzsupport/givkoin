import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

type GalaxyWishModalShellProps = {
  backdropClassName: string;
  children: ReactNode;
  isOpen: boolean;
  onClose: () => void;
  panelClassName: string;
  zIndexClassName: string;
};

export function GalaxyWishModalShell({
  backdropClassName,
  children,
  isOpen,
  onClose,
  panelClassName,
  zIndexClassName,
}: GalaxyWishModalShellProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className={`fixed inset-0 ${zIndexClassName} flex items-center justify-center p-4`}>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className={`absolute inset-0 ${backdropClassName}`}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            onClick={(e) => e.stopPropagation()}
            className={panelClassName}
          >
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
