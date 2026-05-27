const NAVIGATION_TARGET_PATHS = [
  '/fortune/roulette',
  '/fortune/lottery',
  '/activity/collect',
  '/activity/night-shift',
  '/activity/attendance',
  '/activity/achievements',
  '/bridges',
  '/tree/solar',
  '/battle',
];

function isNavigationTargetPath(path) {
  const clean = String(path || '').split('?')[0].trim().toLowerCase();
  if (!clean) return false;
  return NAVIGATION_TARGET_PATHS.some((prefix) => clean === prefix || clean.startsWith(`${prefix}/`));
}

function getPagePath(row) {
  return String(row?.meta?.path || '').split('?')[0].trim();
}

function buildDirectNavigationSignature(rows = []) {
  const counts = new Map();
  for (const row of rows) {
    const path = getPagePath(row);
    if (!path) continue;
    counts.set(path, (counts.get(path) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([path, count]) => `${path}:${count}`)
    .join('|');
}

function buildProfitRoutineSignature(rows = []) {
  const typeCounts = new Map();
  const hourBands = [0, 0, 0, 0];
  for (const row of rows) {
    const type = String(row?.type || '').trim();
    if (!type) continue;
    typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
    const date = new Date(row?.createdAt || 0);
    const hour = Number.isNaN(date.getTime()) ? -1 : date.getUTCHours();
    if (hour >= 0) {
      hourBands[Math.floor(hour / 6)] += 1;
    }
  }
  const topTypes = Array.from(typeCounts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([type, count]) => `${type}:${count}`)
    .join('|');
  return `${topTypes}#${hourBands.join(',')}`;
}

module.exports = {
  NAVIGATION_TARGET_PATHS,
  buildDirectNavigationSignature,
  buildProfitRoutineSignature,
  getPagePath,
  isNavigationTargetPath,
};
