const { getSupabaseClient } = require('../../lib/supabaseClient');
const {
  sanitizeRewardRollbackEntries,
} = require('./rewardRollback');
const {
  getUserData,
  normalizeUserRow,
} = require('./userRows');

function cleanText(value) {
  return String(value || '').trim();
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round(value, digits = 3) {
  const n = safeNumber(value);
  const power = 10 ** digits;
  return Math.round(n * power) / power;
}

function createRewardRollbackActions(deps = {}) {
  const getClient = deps.getSupabaseClient || getSupabaseClient;
  const getUsersByIdsDetailed = deps.getUsersByIdsDetailed;
  const now = typeof deps.now === 'function' ? deps.now : () => new Date();

  async function updateUserRewardRollbackState(userId, { k, rewardRollbackDebtK }) {
    const row = await getUsersByIdsDetailed([userId]);
    const user = Array.isArray(row) ? row[0] : null;
    if (!user) return null;
    const supabase = getClient();
    const data = getUserData(user);
    const nowIso = now().toISOString();
    const nextData = {
      ...data,
      k: round(Math.max(0, safeNumber(k)), 3),
      rewardRollbackDebtK: round(Math.max(0, safeNumber(rewardRollbackDebtK)), 3),
    };
    const { data: updated, error } = await supabase
      .from('users')
      .update({
        data: nextData,
        updated_at: nowIso,
      })
      .eq('id', String(userId))
      .select('id,email,nickname,role,status,email_confirmed,access_restricted_until,access_restriction_reason,last_ip,last_device_id,last_fingerprint,data')
      .maybeSingle();
    if (error || !updated) return null;
    return normalizeUserRow(updated);
  }

  async function createRewardRollbackTransaction({
    userId,
    riskCaseId,
    battleId,
    amount,
    description,
  }) {
    const safeAmount = round(Math.max(0, safeNumber(amount)), 3);
    if (!(safeAmount > 0)) return null;
    const supabase = getClient();
    const nowIso = now().toISOString();
    const { data, error } = await supabase
      .from('transactions')
      .insert({
        user_id: String(userId),
        type: 'admin',
        direction: 'debit',
        amount: safeAmount,
        currency: 'K',
        description: cleanText(description) || 'Откат спорной награды боя',
        related_entity: String(riskCaseId || battleId || ''),
        status: 'completed',
        occurred_at: nowIso,
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select('id')
      .maybeSingle();
    if (error) return null;
    return cleanText(data?.id);
  }

  async function applyPendingBattleRewardRollback({
    riskCase,
    users = [],
    actorId = null,
  }) {
    const userMap = new Map((Array.isArray(users) ? users : []).map((user) => [cleanText(user?._id), user]));
    const originalRewardRollback = Array.isArray(riskCase?.rewardRollback) ? riskCase.rewardRollback : [];
    const rewardRollback = sanitizeRewardRollbackEntries(
      originalRewardRollback,
      Array.isArray(riskCase?.evidence) ? riskCase.evidence : (Array.isArray(riskCase?.riskScoreDetailed) ? riskCase.riskScoreDetailed : []),
      userMap
    );
    if (!rewardRollback.length) {
      return { rewardRollback: [], changed: originalRewardRollback.length > 0 };
    }

    const out = [];
    let changed = originalRewardRollback.length !== rewardRollback.length;

    for (const row of rewardRollback) {
      const safeStatus = cleanText(row?.status || 'pending') || 'pending';
      if (safeStatus !== 'pending') {
        out.push(row);
        continue;
      }

      const userId = cleanText(row?.userId);
      const user = userMap.get(userId);
      if (!user) {
        out.push({
          ...row,
          status: 'missing_user',
        });
        continue;
      }

      const userData = getUserData(user);
      const amount = round(Math.max(0, safeNumber(row?.amount)), 3);
      const currentK = round(Math.max(0, safeNumber(userData?.k)), 3);
      const previousDebt = round(Math.max(0, safeNumber(userData?.rewardRollbackDebtK)), 3);
      const rolledBackAmount = round(Math.min(currentK, amount), 3);
      const shortfall = round(Math.max(0, amount - rolledBackAmount), 3);
      const nextK = round(Math.max(0, currentK - rolledBackAmount), 3);
      const nextDebt = round(previousDebt + shortfall, 3);
      const nowIso = now().toISOString();

      if (rolledBackAmount > 0 || shortfall > 0) {
        // eslint-disable-next-line no-await-in-loop
        const updatedUser = await updateUserRewardRollbackState(userId, {
          k: nextK,
          rewardRollbackDebtK: nextDebt,
        });
        if (updatedUser) userMap.set(userId, updatedUser);

        let transactionId = '';
        if (rolledBackAmount > 0) {
          // eslint-disable-next-line no-await-in-loop
          transactionId = await createRewardRollbackTransaction({
            userId,
            riskCaseId: riskCase?._id,
            battleId: row?.battleId,
            amount: rolledBackAmount,
            description: 'Откат спорной награды боя по решению модератора',
          }) || '';
        }

        out.push({
          ...row,
          status: shortfall > 0 ? 'partial_rollback' : 'rolled_back',
          rolledBackAmount,
          shortfall,
          rolledBackAt: nowIso,
          rolledBackBy: actorId || null,
          rollbackTransactionId: transactionId,
        });
        changed = true;
        continue;
      }

      out.push(row);
    }

    return { rewardRollback: out, changed };
  }

  return {
    applyPendingBattleRewardRollback,
    createRewardRollbackTransaction,
    updateUserRewardRollbackState,
  };
}

module.exports = {
  createRewardRollbackActions,
};
