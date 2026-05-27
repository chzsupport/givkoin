import { motion } from 'framer-motion';
import type { BattleSummary } from '@/lib/battleSummary';
import { RESULT_LABEL_KEYS } from '@/components/battle/summary-overlay/constants';

export function ResultWord({
    result,
    t,
    parchmentClassName,
}: {
    result: BattleSummary['result'];
    t: (key: string) => string;
    parchmentClassName: string;
}) {
    if (!result) return null;

    const colorClass = result === 'light'
        ? 'text-[#b7df93]'
        : result === 'dark'
            ? 'text-[#e29a72]'
            : 'text-[#e2c27a]';

    return (
        <motion.div
            className={`py-1 text-center ${parchmentClassName} ${colorClass}`}
            animate={{
                scale: [1, 1.035, 1],
                opacity: [0.92, 1, 0.92],
                textShadow: [
                    '0 0 0 rgba(0,0,0,0)',
                    result === 'light'
                        ? '0 0 18px rgba(68,146,84,0.28)'
                        : result === 'dark'
                            ? '0 0 18px rgba(159,61,52,0.24)'
                            : '0 0 16px rgba(163,116,53,0.22)',
                    '0 0 0 rgba(0,0,0,0)',
                ],
            }}
            transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
        >
            <div className="text-[2.6rem] font-bold leading-none tracking-[0.04em] md:text-[4.2rem]">
                {t(RESULT_LABEL_KEYS[result])}
            </div>
        </motion.div>
    );
}
