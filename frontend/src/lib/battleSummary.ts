'use client';

export type BattleSummaryResult = 'light' | 'dark' | 'draw' | null;
export type BattleSummaryLineState = 'pending' | 'ready' | 'error';
export type BattleSummaryLocale = 'ru' | 'en';
export type BattleSummaryLocalizedText = {
    ru?: string | null;
    en?: string | null;
};

export type BattleSummaryLine = {
    key: string;
    label: string;
    state: BattleSummaryLineState;
    valueText: string | null;
    errorText: string | null;
};

export type BattleSummary = {
    battleId: string;
    introText: string;
    screenStage: 'streaming' | 'done';
    isComplete: boolean;
    personalDataSource: string;
    personalDataSourceLabel: string;
    result: BattleSummaryResult;
    userDamage: number;
    rewardK: number;
    durationSeconds: number | null;
    totalLightDamage: number | null;
    totalDarkDamage: number | null;
    attendanceCount: number | null;
    bestPlayer: { nickname: string } | null;
    injury: { branchName: string; requiredRadiance: number; debuffPercent: number } | null;
    awardedAchievements: number[];
    detailsPending: boolean;
    detailsRetryAfterMs: number;
    detailsReadyAtMs: number | null;
    lines: BattleSummaryLine[];
};

export type BattleSummaryPayload = Partial<BattleSummary> & {
    ok?: boolean;
    pending?: boolean;
    readyAtMs?: number | null;
    retryAfterMs?: number | null;
    introTextByLocale?: BattleSummaryLocalizedText | null;
    personalDataSourceLabelByLocale?: BattleSummaryLocalizedText | null;
    lines?: Array<(Partial<BattleSummaryLine> & {
        labelByLocale?: BattleSummaryLocalizedText | null;
        valueTextByLocale?: BattleSummaryLocalizedText | null;
        errorTextByLocale?: BattleSummaryLocalizedText | null;
    }) | null | undefined>;
};

export const BATTLE_SUMMARY_LINE_ORDER = [
    'user_damage',
    'reward_k',
    'duration',
    'best_player',
    'achievements',
    'injury',
    'result',
    'total_dark_damage',
    'total_light_damage',
];

const normalizeNullableBattleNumber = (value: unknown) => (
    Number.isFinite(Number(value))
        ? Math.max(0, Math.floor(Number(value) || 0))
        : null
);

const normalizeBattleSummaryLocale = (value?: string): BattleSummaryLocale => (
    value === 'en' ? 'en' : 'ru'
);

const getBattleSummaryLocaleCode = (language: BattleSummaryLocale) => (
    language === 'en' ? 'en-US' : 'ru-RU'
);

const formatBattleSummaryNumber = (value: number, language: BattleSummaryLocale) => (
    Math.max(0, Math.floor(Number(value) || 0)).toLocaleString(getBattleSummaryLocaleCode(language))
);

const formatBattleSummaryDate = (value: string | number | Date, language: BattleSummaryLocale) => (
    new Intl.DateTimeFormat(getBattleSummaryLocaleCode(language), {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    }).format(new Date(value))
);

const formatBattleSummaryTime = (value: string | number | Date, language: BattleSummaryLocale) => (
    new Intl.DateTimeFormat(getBattleSummaryLocaleCode(language), {
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(value))
);

const BATTLE_SUMMARY_LABELS: Record<string, Record<BattleSummaryLocale, string>> = {
    user_damage: { ru: '\u041b\u0438\u0447\u043d\u044b\u0439 \u0443\u0440\u043e\u043d', en: 'Personal damage' },
    reward_k: { ru: '\u0417\u0430\u0440\u0430\u0431\u043e\u0442\u043e\u043a \u0432 K', en: 'Earned K' },
    duration: { ru: '\u0414\u043b\u0438\u0442\u0435\u043b\u044c\u043d\u043e\u0441\u0442\u044c \u0431\u043e\u044f', en: 'Battle duration' },
    best_player: { ru: '\u041b\u0443\u0447\u0448\u0438\u0439 \u0438\u0433\u0440\u043e\u043a', en: 'Top player' },
    achievements: { ru: '\u0414\u043e\u0441\u0442\u0438\u0436\u0435\u043d\u0438\u044f', en: 'Achievements' },
    injury: { ru: '\u0422\u0440\u0430\u0432\u043c\u0430', en: 'Injury' },
    result: { ru: '\u041f\u043e\u0431\u0435\u0434\u0430 \u0438\u043b\u0438 \u041f\u043e\u0440\u0430\u0436\u0435\u043d\u0438\u0435', en: 'Outcome' },
    total_dark_damage: { ru: '\u041e\u0431\u0449\u0438\u0439 \u0443\u0440\u043e\u043d \u041c\u0440\u0430\u043a\u0430', en: 'Total Darkness damage' },
    total_light_damage: { ru: '\u041e\u0431\u0449\u0438\u0439 \u0443\u0440\u043e\u043d \u0421\u0432\u0435\u0442\u0430', en: 'Total Light damage' },
};

const BATTLE_SUMMARY_RESULT_TEXT: Record<Exclude<BattleSummaryResult, null>, Record<BattleSummaryLocale, string>> = {
    light: { ru: '\u041f\u043e\u0431\u0435\u0434\u0430', en: 'Victory' },
    dark: { ru: '\u041f\u043e\u0440\u0430\u0436\u0435\u043d\u0438\u0435', en: 'Defeat' },
    draw: { ru: '\u041d\u0438\u0447\u044c\u044f', en: 'Draw' },
};

const pickLocalizedBattleText = (
    localized: BattleSummaryLocalizedText | null | undefined,
    fallback: unknown,
    language: BattleSummaryLocale,
) => {
    const safeLocalized = localized && typeof localized === 'object' ? localized : null;
    const localizedPrimary = safeLocalized?.[language];
    if (localizedPrimary != null && String(localizedPrimary).trim()) {
        return String(localizedPrimary);
    }

    const fallbackLocale = language === 'en' ? safeLocalized?.ru : safeLocalized?.en;
    if (fallbackLocale != null && String(fallbackLocale).trim()) {
        return String(fallbackLocale);
    }

    if (fallback == null) return '';
    return String(fallback);
};

const normalizeBattleSummaryLine = (
    value: (Partial<BattleSummaryLine> & {
        labelByLocale?: BattleSummaryLocalizedText | null;
        valueTextByLocale?: BattleSummaryLocalizedText | null;
        errorTextByLocale?: BattleSummaryLocalizedText | null;
    }) | null | undefined,
    language: BattleSummaryLocale,
): BattleSummaryLine | null => {
    const row = value && typeof value === 'object' ? value : {};
    const key = String(row.key || '').trim();
    const label = pickLocalizedBattleText(row.labelByLocale, row.label, language).trim();
    if (!key || !label) return null;
    const stateRaw = String(row.state || '').trim();
    const valueTextRaw = pickLocalizedBattleText(row.valueTextByLocale, row.valueText, language);
    const errorTextRaw = pickLocalizedBattleText(row.errorTextByLocale, row.errorText, language);
    return {
        key,
        label,
        state: stateRaw === 'ready' || stateRaw === 'error' ? stateRaw : 'pending',
        valueText: valueTextRaw.trim() ? valueTextRaw : null,
        errorText: errorTextRaw.trim() ? errorTextRaw : null,
    };
};

const normalizeIncomingLines = (
    nextLines: BattleSummaryPayload['lines'],
    language: BattleSummaryLocale,
): BattleSummaryLine[] => (
    (Array.isArray(nextLines) ? nextLines : [])
        .map((line) => normalizeBattleSummaryLine(line, language))
        .filter((line): line is BattleSummaryLine => Boolean(line))
);

const mergeBattleSummaryLines = (
    nextLines: BattleSummaryPayload['lines'],
    language: BattleSummaryLocale,
    previousLines: BattleSummaryLine[] = [],
): BattleSummaryLine[] => {
    const previousByKey = new Map(
        (Array.isArray(previousLines) ? previousLines : [])
            .filter((line) => line && line.key)
            .map((line) => [line.key, line]),
    );
    const nextByKey = new Map(
        normalizeIncomingLines(nextLines, language)
            .map((line) => [line.key, line]),
    );

    const out: BattleSummaryLine[] = [];
    for (const key of BATTLE_SUMMARY_LINE_ORDER) {
        const next = nextByKey.get(key);
        const previous = previousByKey.get(key);
        if (next) {
            out.push(next);
            continue;
        }
        if (previous) {
            out.push(previous);
        }
    }

    for (const [key, value] of nextByKey.entries()) {
        if (!BATTLE_SUMMARY_LINE_ORDER.includes(key)) {
            out.push(value);
        }
    }

    return out;
};

const buildBattleSummaryIntroFallback = (
    detailsReadyAtMs: number | null,
    language: BattleSummaryLocale,
    fallback: string,
) => {
    if (!detailsReadyAtMs) {
        return fallback;
    }

    if (language === 'en') {
        return `Today, ${formatBattleSummaryDate(detailsReadyAtMs, language)} at ${formatBattleSummaryTime(detailsReadyAtMs, language)}, Darkness attacked the world of GIVKOIN. The Tree, as always, took the blow upon itself. By the efforts of the Keeper and the fighters, the following results were achieved:`;
    }

    return `\u0421\u0435\u0433\u043e\u0434\u043d\u044f ${formatBattleSummaryDate(detailsReadyAtMs, language)} \u0432 ${formatBattleSummaryTime(detailsReadyAtMs, language)} \u041c\u0440\u0430\u043a \u0441\u043e\u0432\u0435\u0440\u0448\u0438\u043b \u043d\u0430\u043f\u0430\u0434\u0435\u043d\u0438\u0435 \u043d\u0430 \u043c\u0438\u0440 GIVKOIN. \u0414\u0440\u0435\u0432\u043e, \u043a\u0430\u043a \u0438 \u0432\u0441\u0435\u0433\u0434\u0430, \u043f\u0440\u0438\u043d\u044f\u043b\u043e \u0443\u0434\u0430\u0440 \u043d\u0430 \u0441\u0435\u0431\u044f. \u0421\u0438\u043b\u0430\u043c\u0438 \u0425\u0440\u0430\u043d\u0438\u0442\u0435\u043b\u044f \u0438 \u0431\u043e\u0439\u0446\u043e\u0432 \u043f\u043e\u043b\u0443\u0447\u0435\u043d\u044b \u0441\u043b\u0435\u0434\u0443\u044e\u0449\u0438\u0435 \u0440\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442\u044b:`;
};

const buildBattleSummaryLineValueFallback = (
    summary: BattleSummary,
    line: BattleSummaryLine,
    language: BattleSummaryLocale,
) => {
    if (line.state !== 'ready') {
        return line.valueText;
    }

    switch (line.key) {
        case 'user_damage':
            return formatBattleSummaryNumber(summary.userDamage, language);
        case 'reward_k':
            return `${formatBattleSummaryNumber(summary.rewardK, language)} K`;
        case 'duration':
            return summary.durationSeconds == null
                ? line.valueText
                : `${formatBattleSummaryNumber(summary.durationSeconds, language)} ${language === 'en' ? 'sec' : '\u0441\u0435\u043a'}`;
        case 'best_player':
            if (summary.bestPlayer?.nickname) {
                if (summary.attendanceCount != null) {
                    return language === 'en'
                        ? `${summary.bestPlayer.nickname} out of ${formatBattleSummaryNumber(summary.attendanceCount, language)}`
                        : `${summary.bestPlayer.nickname} \u0438\u0437 ${formatBattleSummaryNumber(summary.attendanceCount, language)}`;
                }
                return summary.bestPlayer.nickname;
            }
            return language === 'en' ? 'Not set' : '\u041d\u0435 \u043e\u043f\u0440\u0435\u0434\u0435\u043b\u0451\u043d';
        case 'achievements':
            return summary.awardedAchievements.length
                ? summary.awardedAchievements.map((achievementId) => `#${achievementId}`).join(', ')
                : (language === 'en' ? 'Not earned' : '\u041d\u0435 \u043f\u043e\u043b\u0443\u0447\u0435\u043d\u044b');
        case 'injury':
            if (summary.result !== 'dark' || !summary.injury?.branchName) {
                return language === 'en' ? 'None' : '\u041d\u0435\u0442';
            }
            return language === 'en'
                ? `Branch ${summary.injury.branchName}: ${formatBattleSummaryNumber(summary.injury.requiredRadiance, language)} Radiance, weakening ${Math.max(0, Math.floor(Number(summary.injury.debuffPercent) || 0))}%`
                : `\u0412\u0435\u0442\u0432\u044c ${summary.injury.branchName}: ${formatBattleSummaryNumber(summary.injury.requiredRadiance, language)} \u0421\u0438\u044f\u043d\u0438\u044f, \u043e\u0441\u043b\u0430\u0431\u043b\u0435\u043d\u0438\u0435 ${Math.max(0, Math.floor(Number(summary.injury.debuffPercent) || 0))}%`;
        case 'result':
            return summary.result ? BATTLE_SUMMARY_RESULT_TEXT[summary.result][language] : line.valueText;
        case 'total_dark_damage':
            return summary.totalDarkDamage == null ? line.valueText : formatBattleSummaryNumber(summary.totalDarkDamage, language);
        case 'total_light_damage':
            return summary.totalLightDamage == null ? line.valueText : formatBattleSummaryNumber(summary.totalLightDamage, language);
        default:
            return line.valueText;
    }
};

const localizeBattleSummaryFallback = (
    summary: BattleSummary,
    language: BattleSummaryLocale,
) => ({
    ...summary,
    introText: buildBattleSummaryIntroFallback(summary.detailsReadyAtMs, language, summary.introText),
    lines: summary.lines.map((line) => ({
        ...line,
        label: BATTLE_SUMMARY_LABELS[line.key]?.[language] || line.label,
        valueText: buildBattleSummaryLineValueFallback(summary, line, language),
    })),
});

export const parseBattleSummaryPayload = (
    payload: BattleSummaryPayload | null | undefined,
    previous: BattleSummary | null = null,
    language: string = 'ru',
): BattleSummary | null => {
    const safeLanguage = normalizeBattleSummaryLocale(language);
    const battleId = typeof payload?.battleId === 'string' ? payload.battleId : previous?.battleId || '';
    if (!battleId) return null;
    const safePrevious = previous?.battleId === battleId ? previous : null;

    const incomingLines = normalizeIncomingLines(payload?.lines, safeLanguage);
    const incomingHasPendingLines = incomingLines.some((line) => line.state !== 'ready');
    const incomingDetailsPending = typeof payload?.detailsPending === 'boolean'
        ? payload.detailsPending
        : incomingHasPendingLines;
    const incomingIsComplete = typeof payload?.isComplete === 'boolean'
        ? payload.isComplete
        : !incomingDetailsPending;
    const preserveCompletedSummary = Boolean(safePrevious?.isComplete) && !incomingIsComplete;

    const lines = preserveCompletedSummary
        ? (safePrevious?.lines || [])
        : mergeBattleSummaryLines(payload?.lines, safeLanguage, safePrevious?.lines || []);
    const detailsPending = preserveCompletedSummary
        ? false
        : (typeof payload?.detailsPending === 'boolean'
            ? payload.detailsPending
            : lines.some((line) => line.state !== 'ready'));
    const isComplete = preserveCompletedSummary
        ? true
        : (typeof payload?.isComplete === 'boolean'
            ? payload.isComplete
            : !detailsPending);

    const nextSummary: BattleSummary = {
        battleId,
        introText: pickLocalizedBattleText(
            payload?.introTextByLocale,
            payload?.introText,
            safeLanguage,
        ) || safePrevious?.introText || '',
        screenStage: String(payload?.screenStage || '').trim() === 'done' || isComplete ? 'done' : 'streaming',
        isComplete,
        personalDataSource: typeof payload?.personalDataSource === 'string'
            ? payload.personalDataSource
            : safePrevious?.personalDataSource || 'none',
        personalDataSourceLabel: pickLocalizedBattleText(
            payload?.personalDataSourceLabelByLocale,
            payload?.personalDataSourceLabel,
            safeLanguage,
        ) || safePrevious?.personalDataSourceLabel || '',
        result: payload?.result === 'light' || payload?.result === 'dark' || payload?.result === 'draw'
            ? payload.result
            : (safePrevious?.result || null),
        userDamage: Math.max(0, Math.floor(Number(payload?.userDamage) || safePrevious?.userDamage || 0)),
        rewardK: Math.max(0, Math.floor(Number(payload?.rewardK) || safePrevious?.rewardK || 0)),
        durationSeconds: normalizeNullableBattleNumber(payload?.durationSeconds) ?? safePrevious?.durationSeconds ?? null,
        totalLightDamage: normalizeNullableBattleNumber(payload?.totalLightDamage) ?? safePrevious?.totalLightDamage ?? null,
        totalDarkDamage: normalizeNullableBattleNumber(payload?.totalDarkDamage) ?? safePrevious?.totalDarkDamage ?? null,
        attendanceCount: normalizeNullableBattleNumber(payload?.attendanceCount) ?? safePrevious?.attendanceCount ?? null,
        bestPlayer: payload?.bestPlayer?.nickname
            ? { nickname: String(payload.bestPlayer.nickname) }
            : (payload?.bestPlayer === null ? null : safePrevious?.bestPlayer ?? null),
        injury: payload?.injury && typeof payload.injury === 'object'
            ? {
                branchName: String(payload.injury.branchName || ''),
                requiredRadiance: Math.max(0, Math.floor(Number(payload.injury.requiredRadiance) || 0)),
                debuffPercent: Math.max(0, Math.floor(Number(payload.injury.debuffPercent) || 0)),
            }
            : (payload?.injury === null ? null : safePrevious?.injury ?? null),
        awardedAchievements: Array.isArray(payload?.awardedAchievements)
            ? payload.awardedAchievements.map((id) => Number(id)).filter((id) => Number.isFinite(id))
            : (safePrevious?.awardedAchievements || []),
        detailsPending,
        detailsRetryAfterMs: detailsPending
            ? Math.max(1000, Math.floor(Number(payload?.detailsRetryAfterMs) || safePrevious?.detailsRetryAfterMs || 3000))
            : 0,
        detailsReadyAtMs: Number.isFinite(Number(payload?.detailsReadyAtMs))
            ? Math.max(0, Math.floor(Number(payload?.detailsReadyAtMs) || 0))
            : (safePrevious?.detailsReadyAtMs ?? null),
        lines,
    };

    return localizeBattleSummaryFallback(nextSummary, safeLanguage);
};

