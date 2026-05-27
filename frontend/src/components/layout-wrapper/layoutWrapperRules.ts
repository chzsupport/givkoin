import { normalizeSitePath, pathStartsWith } from '@/utils/sitePath';

const NAVIGATION_RULES: Record<string, string[][]> = {
    '/fortune/roulette': [['/fortune'], ['/tree', '/fortune']],
    '/fortune/lottery': [['/fortune'], ['/tree', '/fortune']],
    '/activity/achievements': [['/cabinet/activity']],
    '/activity/collect': [['/cabinet/activity']],
    '/activity/night-shift': [['/cabinet/activity']],
    '/activity/attendance': [['/cabinet/activity']],
};

export type NavigationIntent = { path: string; at: number } | null;

export function isOpenRoute(path: string) {
    const clean = normalizeSitePath(path);
    if (clean === '/') return true;
    if (clean === '/login' || clean === '/register' || clean === '/forgot-password' || clean === '/reset-password') return true;
    if (pathStartsWith(clean, '/confirm')) return true;
    if (clean === '/about' || clean === '/rules' || clean === '/feedback' || clean === '/roadmap') return true;
    return false;
}

export function normalizeTrackedPath(path: string) {
    const clean = normalizeSitePath(path).trim();
    if (!clean) return '/';
    return clean.slice(0, 120);
}

export function scanForAdSlots() {
    if (typeof document === 'undefined') return false;
    return Boolean(document.querySelector('[data-ad-block="1"]'));
}

export function pageHasAds(path: string) {
    const clean = normalizeSitePath(path);
    const exactPaths = new Set([
        '/about',
        '/rules',
        '/roadmap',
        '/feedback',
        '/tree',
        '/news',
        '/chronicle',
        '/entity/profile',
        '/shop',
        '/practice',
        '/practice/gratitude',
        '/practice/meditation/me',
        '/practice/meditation/we',
        '/galaxy',
        '/fortune',
        '/fortune/roulette',
        '/fortune/lottery',
        '/bridges',
        '/activity/night-shift',
        '/activity/attendance',
        '/activity/collect',
        '/activity/achievements',
    ]);

    if (exactPaths.has(clean)) return true;

    if (pathStartsWith(clean, '/chat')) return true;

    return false;
}

export function classifyNavigation(
    path: string,
    previousPath: string,
    intent: NavigationIntent,
    recentPaths: string[]
) {
    const currentPath = normalizeTrackedPath(path);
    const normalizedPrevious = normalizeTrackedPath(previousPath);
    const intentFresh = intent && (Date.now() - intent.at) <= 4000;
    const viaUiClick = Boolean(intentFresh && normalizeTrackedPath(intent.path) === currentPath);
    const navigationSource = !normalizedPrevious
        ? 'initial_load'
        : viaUiClick
            ? 'ui_click'
            : 'direct_open';

    const options = NAVIGATION_RULES[currentPath] || [];
    const chainExpected = options.length > 0;
    const chainSatisfied = !chainExpected || options.some((sequence) => {
        if (!sequence.length) return true;
        const tail = recentPaths.slice(-sequence.length);
        return sequence.every((value, index) => normalizeTrackedPath(tail[index]) === normalizeTrackedPath(value));
    });

    return {
        previousPath: normalizedPrevious,
        navigationSource,
        viaUiClick,
        uiTargetPath: viaUiClick ? currentPath : '',
        isDirectNavigation: navigationSource === 'direct_open',
        chainExpected,
        chainSatisfied,
        skippedPaths: chainExpected && !chainSatisfied
            ? Array.from(new Set(options.flat().map((item) => normalizeTrackedPath(item))))
            : [],
        navigationLatencyMs: viaUiClick && intent ? Date.now() - intent.at : null,
    };
}
