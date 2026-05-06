const toNumber = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

module.exports = {
  CHAT_K_PER_HOUR: toNumber(process.env.CHAT_K_PER_HOUR, 12),
  CHAT_MINUTES_PER_DAY_CAP: toNumber(process.env.CHAT_MINUTES_PER_DAY_CAP, 600), // 10 часов

  NEWS_LIKE_LIMIT_PER_DAY: toNumber(process.env.NEWS_LIKE_LIMIT_PER_DAY, 24),
  NEWS_COMMENT_LIMIT_PER_DAY: toNumber(process.env.NEWS_COMMENT_LIMIT_PER_DAY, 72),
  NEWS_REPOST_LIMIT_PER_DAY: toNumber(process.env.NEWS_REPOST_LIMIT_PER_DAY, 24),
  NEWS_COMMENTS_PER_POST_LIMIT: toNumber(process.env.NEWS_COMMENTS_PER_POST_LIMIT, 3),
  NEWS_LIKE_REWARD: toNumber(process.env.NEWS_LIKE_REWARD, 0.5),
  NEWS_COMMENT_REWARD: toNumber(process.env.NEWS_COMMENT_REWARD, 1.5),
  NEWS_REPOST_REWARD: 1,

  BATTLE_DURATION_SECONDS: toNumber(process.env.BATTLE_DURATION_SECONDS, 900),
  BATTLE_CRON: process.env.BATTLE_CRON || '0 */48 * * *',

  LUMENS_DAILY_LIMIT: toNumber(process.env.LUMENS_DAILY_LIMIT, 2400),

  EVIL_ROOT_SYMBOLS_PER_REWARD: toNumber(process.env.EVIL_ROOT_SYMBOLS_PER_REWARD, 3000),
  EVIL_ROOT_STARS_PER_REWARD: toNumber(process.env.EVIL_ROOT_STARS_PER_REWARD, 0.01),
  EVIL_ROOT_RADIANCE_SYMBOLS_STEP: toNumber(process.env.EVIL_ROOT_RADIANCE_SYMBOLS_STEP, 1000),
  EVIL_ROOT_RADIANCE_PER_STEP: toNumber(process.env.EVIL_ROOT_RADIANCE_PER_STEP, 0.1),
  EVIL_ROOT_DAILY_SESSIONS: toNumber(process.env.EVIL_ROOT_DAILY_SESSIONS, 3),
  EVIL_ROOT_DAILY_RADIANCE_LIMIT: toNumber(process.env.EVIL_ROOT_DAILY_RADIANCE_LIMIT, 10),
};

