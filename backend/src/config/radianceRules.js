function toPositiveInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function toPositiveNumber(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

function byUnits(unitAmount, { minUnits = 1, fallbackUnits = 1 } = {}) {
  return ({ units, meta = {} }) => {
    const fallback = toPositiveInt(meta.units, fallbackUnits);
    const safeUnits = Math.max(minUnits, toPositiveInt(units, fallback));
    return safeUnits * unitAmount;
  };
}

const RADIANCE_RULES = {
  chat_1h: {
    awardStep: 10,
    resolveAmount: byUnits(10),
  },
  chat_rate: {
    awardStep: 1,
    resolveAmount: ({ amount, meta = {} }) => {
      if (meta.liked === false || meta.rating === false) return 1;
      const explicit = Number(amount);
      if (explicit === 1) return 1;
      return 2;
    },
  },
  friend_add: { amount: 5, awardStep: 5 },
  wish_create: { amount: 3, awardStep: 3 },
  wish_support: { amount: 5, awardStep: 5 },
  bridge_contribute: {
    awardStep: 5,
    resolveAmount: ({ units, meta = {} }) => {
      const stones = Math.max(1, toPositiveInt(units, toPositiveInt(meta.stones, 1)));
      return stones * 5;
    },
  },
  bridge_create: { amount: 10, awardStep: 10 },
  fortune_spin: {
    awardStep: 2,
    resolveAmount: byUnits(2),
  },
  lottery_ticket_buy: {
    awardStep: 3,
    resolveAmount: byUnits(3),
  },
  personal_luck: { amount: 5, awardStep: 5 },
  entity_create: { amount: 10, awardStep: 10 },
  solar_collect: { amount: 10, awardStep: 10 },
  solar_share: { amount: 10, awardStep: 10 },
  evil_root_confession: {
    awardStep: 10,
    dailyLimitAmount: 1000,
    resolveAmount: ({ units, meta = {} }) => {
      const explicitUnits = Math.floor((Number(meta.symbols) || 0) / 1000);
      const chunks = Math.max(0, toPositiveInt(units, explicitUnits));
      return chunks * 10;
    },
  },
  tree_heal_button: {
    awardStep: 4,
    resolveAmount: ({ units, meta = {} }) => {
      const lumens = Math.max(1, toPositiveInt(units, toPositiveInt(meta.lumens, 1)));
      return lumens * 4;
    },
  },
  news_like: { amount: 2, awardStep: 2 },
  news_comment: { amount: 3, awardStep: 3 },
  news_repost: { amount: 5, awardStep: 5 },
  shard_collect: { amount: 10, awardStep: 10 },
  attendance_day: { amount: 10, awardStep: 10 },
  referral_active: {
    amount: 20,
    awardStep: 20,
    dailyLimitEntries: 10,
  },
  feedback_letter: {
    amount: 10,
    awardStep: 10,
    dailyLimitEntries: 3,
  },
  meditation_individual: {
    awardStep: 1,
    dailyLimitAmount: 100,
    resolveAmount: ({ units, amount, meta = {} }) => {
      const breaths = Math.max(
        0,
        toPositiveInt(units, toPositiveInt(amount, toPositiveInt(meta.completedBreaths, 0)))
      );
      return breaths;
    },
  },
  meditation_group: {
    awardStep: 30,
    resolveAmount: ({ units, amount, meta = {} }) => {
      const entries = Math.max(0, toPositiveInt(units, toPositiveInt(meta.meditations, toPositiveInt(amount, 0))));
      return entries * 30;
    },
  },
  gratitude_write: {
    amount: 10,
    awardStep: 10,
    dailyLimitEntries: 3,
  },
  fruit_collect: { amount: 2, awardStep: 2 },
  night_shift_anomaly: {
    awardStep: 3,
    resolveAmount: ({ units, meta = {} }) => {
      const anomalies = Math.max(0, toPositiveInt(units, toPositiveInt(meta.acceptedAnomalies, 0)));
      return anomalies * 3;
    },
  },
  night_shift_hour: {
    awardStep: 5,
    resolveAmount: ({ units, meta = {} }) => {
      const hours = Math.max(0, toPositiveInt(units, toPositiveInt(meta.payableHours, 0)));
      return hours * 5;
    },
  },
  achievement_any: { amount: 20, awardStep: 20 },
  shop_buy_item: { amount: 5, awardStep: 5 },
  shop_use_item: { amount: 3, awardStep: 3 },
  night_shift: {
    awardStep: 1,
    resolveAmount: ({ amount, meta = {} }) => {
      const anomalies = Math.max(0, toPositiveInt(meta.acceptedAnomalies, 0));
      const hours = Math.max(0, toPositiveInt(meta.payableHours, 0));
      const calculated = (anomalies * 3) + (hours * 5);
      return calculated > 0 ? calculated : toPositiveNumber(amount, 0);
    },
  },
};

function resolveRadianceAmount({ activityType, amount = null, units = null, meta = {}, context = {} }) {
  const rule = RADIANCE_RULES[String(activityType || '').trim()] || null;
  if (!rule) {
    const fallback = toPositiveNumber(amount, 0);
    return {
      amount: fallback,
      awardStep: null,
      rule: null,
    };
  }

  let resolved = 0;
  if (typeof rule.resolveAmount === 'function') {
    resolved = Number(rule.resolveAmount({ amount, units, meta, context })) || 0;
  } else if (Number.isFinite(Number(rule.amount)) && Number(rule.amount) > 0) {
    const multiplier = units == null ? 1 : Math.max(1, toPositiveInt(units, 1));
    resolved = Number(rule.amount) * multiplier;
  } else {
    resolved = toPositiveNumber(amount, 0);
  }

  return {
    amount: resolved > 0 ? resolved : 0,
    awardStep: Number(rule.awardStep) > 0 ? Number(rule.awardStep) : null,
    rule,
  };
}

module.exports = {
  RADIANCE_RULES,
  resolveRadianceAmount,
};
