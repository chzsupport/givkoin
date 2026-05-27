import { AnimatePresence, motion } from 'framer-motion';

export function GalaxyWishLaunchTrail({ launchId }: { launchId: number | null }) {
  return (
    <AnimatePresence>
      {launchId && (
        <motion.div
          key={launchId}
          className="pointer-events-none fixed left-1/2 bottom-20 z-40"
          initial={{ opacity: 0, y: 0, scale: 0.8 }}
          animate={{ opacity: 1, y: -420, scale: 1.1 }}
          exit={{ opacity: 0, y: -460, scale: 1.15 }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
        >
          <div className="relative">
            <div className="w-2 h-28 mx-auto bg-gradient-to-t from-transparent via-purple-400/70 to-blue-300/0 blur-[2px]" />
            <div className="absolute inset-0 w-10 h-10 -left-4 top-20 rounded-full bg-gradient-to-br from-purple-400 via-fuchsia-300 to-blue-300 blur-xl opacity-70" />
            <div className="w-6 h-6 mx-auto rounded-full bg-gradient-to-br from-white via-blue-100 to-purple-200 shadow-[0_0_30px_rgba(147,197,253,0.6)]" />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
