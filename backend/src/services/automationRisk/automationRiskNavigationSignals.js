const {
  addSignal,
  clamp,
  round,
  sortByDate,
  toDayKey,
} = require('./automationRiskScoring');
const {
  buildDirectNavigationSignature,
  getPagePath,
  isNavigationTargetPath,
} = require('./automationRiskNavigation');

function evaluateNavigationSignals(ctx, pageViews = [], profitableActivities = [], now = new Date()) {
  const sortedPageViews = sortByDate(pageViews, 'createdAt');
  const activeDays = new Set(sortedPageViews.map((row) => toDayKey(row?.createdAt)));
  const uniquePaths = new Set(sortedPageViews.map((row) => getPagePath(row)).filter(Boolean));
  const targetViews = sortedPageViews.filter((row) => {
    const path = getPagePath(row);
    return isNavigationTargetPath(path) || Boolean(row?.meta?.chainExpected);
  });
  const directTargetViews = targetViews.filter(
    (row) => row?.meta?.navigationSource === 'direct_open' || row?.meta?.isDirectNavigation,
  );
  const skippedChainViews = targetViews.filter(
    (row) => row?.meta?.chainExpected && row?.meta?.chainSatisfied === false,
  );

  ctx.summary.directNavigationSignature = buildDirectNavigationSignature(directTargetViews);
  ctx.summary.directTargetViews = directTargetViews.length;

  if (
    targetViews.length >= 10 &&
    directTargetViews.length >= 8 &&
    directTargetViews.length / targetViews.length >= 0.75 &&
    new Set(directTargetViews.map((row) => getPagePath(row))).size >= 2
  ) {
    const latest = directTargetViews[directTargetViews.length - 1];
    addSignal(ctx, {
      signal: 'direct_navigation_bias',
      score: clamp(10 + Math.round((directTargetViews.length / targetViews.length) * 15), 10, 24),
      category: 'navigation',
      summary: `${directTargetViews.length} из ${targetViews.length} целевых переходов открыты прямым URL`,
      happenedAt: latest?.createdAt || now,
      meta: {
        targetViews: targetViews.length,
        directViews: directTargetViews.length,
        ratio: round(directTargetViews.length / targetViews.length, 3),
      },
    });
  }

  if (
    targetViews.length >= 8 &&
    skippedChainViews.length >= 5 &&
    skippedChainViews.length / targetViews.length >= 0.5
  ) {
    const latest = skippedChainViews[skippedChainViews.length - 1];
    addSignal(ctx, {
      signal: 'skipped_navigation_chain',
      score: clamp(10 + skippedChainViews.length, 10, 26),
      category: 'navigation',
      summary: `${skippedChainViews.length} переходов пропустили обязательную цепочку экранов`,
      happenedAt: latest?.createdAt || now,
      meta: {
        targetViews: targetViews.length,
        skippedChainViews: skippedChainViews.length,
      },
    });
  }

  if (sortedPageViews.length >= 25 && activeDays.size >= 10 && uniquePaths.size <= 6) {
    const latest = sortedPageViews[sortedPageViews.length - 1];
    addSignal(ctx, {
      signal: 'narrow_page_exploration',
      score: clamp(8 + (10 - uniquePaths.size), 8, 18),
      category: 'navigation',
      summary: `За ${activeDays.size} активных дней посещено только ${uniquePaths.size} страниц`,
      happenedAt: latest?.createdAt || now,
      meta: {
        activeDays: activeDays.size,
        uniquePaths: uniquePaths.size,
        pageViews: sortedPageViews.length,
      },
    });
  }

  const accountAgeDays = Math.max(
    0,
    Math.floor((now.getTime() - new Date(ctx.user?.createdAt || now).getTime()) / (24 * 60 * 60 * 1000)),
  );
  if (
    profitableActivities.length >= 12 &&
    activeDays.size >= 10 &&
    uniquePaths.size <= 8 &&
    accountAgeDays >= 10
  ) {
    const latest = profitableActivities[profitableActivities.length - 1];
    addSignal(ctx, {
      signal: 'profit_without_exploration',
      score: clamp(12 + profitableActivities.length / 6, 12, 24),
      category: 'navigation',
      summary: `Аккаунт фармит ${profitableActivities.length} прибыльных действий при очень узком серфинге`,
      happenedAt: latest?.createdAt || now,
      meta: {
        profitableActions: profitableActivities.length,
        uniquePaths: uniquePaths.size,
        accountAgeDays,
      },
    });
  }
}

module.exports = {
  evaluateNavigationSignals,
};
