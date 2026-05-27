import Image from 'next/image';
import { motion } from 'framer-motion';
import type { BattleSummary } from '@/lib/battleSummary';
import { getAchievementCatalogItem } from '@/lib/achievementCatalog';
import {
    LINE_LABEL_TYPE_DELAY_MS,
    LINE_LABEL_TYPE_STEP,
} from '@/components/battle/summary-overlay/constants';
import { TypingText } from '@/components/battle/summary-overlay/TypingText';
import { getLineLabel } from '@/components/battle/summary-overlay/summaryOverlayUtils';

type SummaryLine = BattleSummary['lines'][number];

function PendingLineValue({
    lineIndex,
    t,
}: {
    lineIndex: number;
    t: (key: string) => string;
}) {
    return (
        <div className="inline-flex items-center justify-end gap-2 text-sm text-[#7a5b34]">
            <span>{lineIndex >= 4 ? t('battle_summary.pending_ink_dry') : t('battle_summary.pending_line_printing')}</span>
            <span className="inline-flex gap-1">
                <span className="h-2 w-2 rounded-full bg-[#8c5b28] animate-pulse" />
                <span className="h-2 w-2 rounded-full bg-[#8c5b28]/80 animate-pulse [animation-delay:140ms]" />
                <span className="h-2 w-2 rounded-full bg-[#8c5b28]/60 animate-pulse [animation-delay:280ms]" />
            </span>
        </div>
    );
}

function LineValue({
    summary,
    lineIndex,
    line,
    t,
    language,
}: {
    summary: BattleSummary | null;
    lineIndex: number;
    line: SummaryLine;
    t: (key: string) => string;
    language: string;
}) {
    if (line.key === 'achievements') {
        if (line.state === 'error') {
            return <div className="text-right text-sm font-semibold text-[#c98d63]">{line.errorText || t('battle_summary.achievements_closed')}</div>;
        }

        if (line.state !== 'ready') {
            return <PendingLineValue lineIndex={lineIndex} t={t} />;
        }

        const achievementCards = (summary?.awardedAchievements || [])
            .map((achievementId) => getAchievementCatalogItem(achievementId, language))
            .filter((achievement): achievement is NonNullable<ReturnType<typeof getAchievementCatalogItem>> => Boolean(achievement));

        if (!achievementCards.length) {
            return <div className="text-right text-lg font-semibold text-[#e2c27a]">{t('battle_summary.achievements_none')}</div>;
        }

        return (
            <div className="flex flex-wrap justify-end gap-3">
                {achievementCards.map((achievement) => (
                    <div
                        key={achievement.id}
                        className="flex min-w-[172px] max-w-[220px] items-center gap-3 rounded-[22px] border border-[#8a6433]/40 bg-[linear-gradient(180deg,rgba(77,49,22,0.94)_0%,rgba(61,39,18,0.96)_100%)] px-3 py-3 text-left shadow-[0_10px_30px_rgba(0,0,0,0.26)]"
                    >
                        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-[16px] border border-[#9c7640]/40 bg-[#7a5a2d]">
                            <Image
                                src={achievement.imageSrc}
                                alt={achievement.title}
                                width={56}
                                height={56}
                                className="h-full w-full object-cover"
                            />
                        </div>
                        <div className="min-w-0">
                            <div className="text-base font-semibold leading-tight text-[#f0d38d]">
                                {achievement.title}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    if (line.state === 'error') {
        return (
            <div className="text-right text-sm font-semibold text-[#c98d63]">
                {line.errorText || t('battle_summary.line_not_written')}
            </div>
        );
    }

    if (line.state !== 'ready') {
        return <PendingLineValue lineIndex={lineIndex} t={t} />;
    }

    return (
        <div className="text-right text-xl font-semibold leading-snug text-[#f0d38d] md:text-2xl">
            {line.valueText || t('battle_summary.value_dash')}
        </div>
    );
}

export function SummaryLineCard({
    summary,
    line,
    lineIndex,
    instant,
    t,
    language,
    parchmentClassName,
}: {
    summary: BattleSummary | null;
    line: SummaryLine;
    lineIndex: number;
    instant: boolean;
    t: (key: string) => string;
    language: string;
    parchmentClassName: string;
}) {
    const label = getLineLabel(summary, line);
    const achievementsLine = line.key === 'achievements';

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 14, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.28, ease: 'easeOut' }}
            className="relative overflow-hidden rounded-[26px] border border-[#8d6839]/38 bg-[linear-gradient(180deg,rgba(96,66,34,0.96)_0%,rgba(74,49,24,0.97)_52%,rgba(56,37,18,0.98)_100%)] px-4 py-4 shadow-[0_16px_42px_rgba(0,0,0,0.28)]"
        >
            <div className="absolute inset-x-0 top-0 h-[1px] bg-[#dfbf82]/60" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_16%,rgba(212,181,109,0.14)_0%,rgba(212,181,109,0)_22%),radial-gradient(circle_at_82%_78%,rgba(31,18,8,0.22)_0%,rgba(31,18,8,0)_28%),radial-gradient(circle_at_52%_42%,rgba(150,112,56,0.12)_0%,rgba(150,112,56,0)_36%)] mix-blend-screen" />
            <div className={`grid gap-4 ${achievementsLine ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(220px,0.9fr)] md:items-start'}`}>
                <div className="min-w-0">
                    <div className="text-[1.15rem] leading-snug text-[#dcc18a] md:text-[1.35rem]">
                        <TypingText
                            text={label}
                            delayMs={LINE_LABEL_TYPE_DELAY_MS}
                            step={LINE_LABEL_TYPE_STEP}
                            instant={instant}
                            className={parchmentClassName}
                        />
                    </div>
                </div>
                <div className={`${achievementsLine ? 'pt-1' : 'self-center'}`}>
                    <LineValue
                        summary={summary}
                        lineIndex={lineIndex}
                        line={line}
                        t={t}
                        language={language}
                    />
                </div>
            </div>
        </motion.div>
    );
}
