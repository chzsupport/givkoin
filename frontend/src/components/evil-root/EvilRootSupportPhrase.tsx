import { AnimatePresence, motion } from 'framer-motion';

export function EvilRootSupportPhrase({ phrase }: { phrase: string | null }) {
  return (
    <AnimatePresence>
      {phrase && (
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 0.75, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.6 }}
          className="absolute top-8 left-1/2 -translate-x-1/2 text-neutral-200/80 text-[28px] md:text-[36px] font-light tracking-wide z-20"
        >
          {phrase}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
