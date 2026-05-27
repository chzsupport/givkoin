const { getSupabaseClient: defaultGetSupabaseClient } = require('../../lib/supabaseClient');
const { getNumericSettingValue: defaultGetNumericSettingValue } = require('../settingsRegistryService');

function hasOwn(obj, key) {
  return Boolean(obj) && Object.prototype.hasOwnProperty.call(obj, key);
}

function round3(value) {
  const n = Number(value);

  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 1000) / 1000;
}

function needsCoreUserDataRecovery(data = {}) {
  const safe = data && typeof data === 'object' ? data : {};
  const missingCoreBalances = !hasOwn(safe, 'k') || !hasOwn(safe, 'lumens') || !hasOwn(safe, 'stars');
  const missingCoreMeta = !hasOwn(safe, 'lives') || !hasOwn(safe, 'complaintChips');
  const missingStats = !safe.achievementStats || typeof safe.achievementStats !== 'object';

  return missingCoreBalances || missingCoreMeta || missingStats;
}

function createAuthUserRecovery({
  getSupabaseClient = defaultGetSupabaseClient,
  getNumericSettingValue = defaultGetNumericSettingValue,
} = {}) {
  async function calculateUserBalancesFromTransactions(userId) {
    if (!userId) {
      return { K: 0, LM: 0, STAR: 0 };
    }

    const supabase = getSupabaseClient();
    const totals = { K: 0, LM: 0, STAR: 0 };
    let from = 0;
    const pageSize = 1000;

    while (true) {
      // eslint-disable-next-line no-await-in-loop
      const { data, error } = await supabase
        .from('transactions')
        .select('direction,amount,currency,status')
        .eq('user_id', String(userId))
        .in('currency', ['K', 'LM', 'STAR'])
        .range(from, from + pageSize - 1);

      if (error || !Array.isArray(data) || !data.length) break;

      for (const row of data) {
        if (String(row?.status || 'completed') !== 'completed') continue;
        const currency = String(row?.currency || '').trim().toUpperCase();
        if (!hasOwn(totals, currency)) continue;

        const amount = Number(row?.amount) || 0;
        if (!amount) continue;

        totals[currency] += String(row?.direction || '').trim() === 'debit' ? -amount : amount;
      }

      if (data.length < pageSize) break;
      from += data.length;
    }

    return totals;
  }

  async function repairDamagedUserData(row) {
    if (!row?.id) return row;

    const currentData = row.data && typeof row.data === 'object' ? row.data : {};
    const needsRecovery = needsCoreUserDataRecovery(currentData);
    const shouldRepairZeroStars = !needsRecovery
      && hasOwn(currentData, 'stars')
      && round3(currentData.stars) <= 0;

    if (!needsRecovery && !shouldRepairZeroStars) {
      return row;
    }

    const tasks = [
      calculateUserBalancesFromTransactions(row.id),
    ];

    if (needsRecovery) {
      tasks.unshift(getNumericSettingValue('INITIAL_LIVES', Number(process.env.INITIAL_LIVES ?? 5) || 5));
    }

    const [initialLivesOrBalances, balancesOrNothing] = await Promise.all(tasks);
    const initialLives = needsRecovery
      ? initialLivesOrBalances
      : Number(process.env.INITIAL_LIVES ?? 5) || 5;
    const balances = needsRecovery
      ? balancesOrNothing
      : initialLivesOrBalances;

    const initialComplaintChips = Number(process.env.INITIAL_COMPLAINT_CHIPS ?? 15) || 15;
    const initialStars = row.email_confirmed ? (Number(process.env.INITIAL_STARS ?? 1) || 1) : 0;
    const initialK = row.email_confirmed ? (Number(process.env.INITIAL_K ?? 0) || 0) : 0;
    const initialLumens = row.email_confirmed ? (Number(process.env.INITIAL_LUMENS ?? 0) || 0) : 0;
    const expectedK = round3(initialK + (Number(balances?.K) || 0));
    const expectedLumens = round3(initialLumens + (Number(balances?.LM) || 0));
    const expectedStars = round3(initialStars + (Number(balances?.STAR) || 0));
    const nextData = { ...currentData };
    let shouldPersist = false;

    if (needsRecovery) {
      nextData.lives = hasOwn(currentData, 'lives') ? currentData.lives : initialLives;
      nextData.complaintChips = hasOwn(currentData, 'complaintChips')
        ? currentData.complaintChips
        : initialComplaintChips;
      nextData.k = hasOwn(currentData, 'k') ? currentData.k : expectedK;
      nextData.lumens = hasOwn(currentData, 'lumens') ? currentData.lumens : expectedLumens;
      nextData.stars = hasOwn(currentData, 'stars') ? currentData.stars : expectedStars;
      nextData.achievementStats = currentData.achievementStats && typeof currentData.achievementStats === 'object'
        ? currentData.achievementStats
        : {};
      shouldPersist = true;
    }

    if (
      shouldRepairZeroStars
      && expectedStars > round3(currentData.stars) + 0.0005
    ) {
      nextData.stars = expectedStars;
      shouldPersist = true;
    }

    if (!shouldPersist) {
      return row;
    }

    const nowIso = new Date().toISOString();
    const { data, error } = await getSupabaseClient()
      .from('users')
      .update({
        data: nextData,
        updated_at: nowIso,
      })
      .eq('id', String(row.id))
      .select('*')
      .maybeSingle();

    if (error || !data) {
      return {
        ...row,
        data: nextData,
      };
    }

    return data;
  }

  return {
    calculateUserBalancesFromTransactions,
    repairDamagedUserData,
  };
}

module.exports = {
  ...createAuthUserRecovery(),
  createAuthUserRecovery,
  needsCoreUserDataRecovery,
  round3,
};
