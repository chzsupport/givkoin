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

function toPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function sortByDate(rows = [], field = 'createdAt') {
  return [...(Array.isArray(rows) ? rows : [])].sort((a, b) => {
    const left = new Date(a?.[field] || 0).getTime();
    const right = new Date(b?.[field] || 0).getTime();
    return left - right;
  });
}

function collectRewardRollbackBattleIds(evidence = []) {
  const battleIds = new Set();
  (Array.isArray(evidence) ? evidence : []).forEach((entry) => {
    const signal = cleanText(entry?.signal);
    const details = toPlainObject(entry?.details);

    if (signal === 'parallel_battle' || signal === 'serial_battle_farming') {
      const battles = Array.isArray(details?.battles) ? details.battles : [];
      battles.forEach((row) => {
        const battleId = cleanText(row?.battleId);
        if (battleId) battleIds.add(battleId);
      });
      return;
    }

    if (signal === 'battle_pattern') {
      const users = Array.isArray(details?.users) ? details.users : [];
      users.forEach((row) => {
        const rowBattleIds = Array.isArray(row?.battleIds) ? row.battleIds : [];
        rowBattleIds.forEach((battleId) => {
          const safeBattleId = cleanText(battleId);
          if (safeBattleId) battleIds.add(safeBattleId);
        });
      });
      return;
    }

    if (signal === 'battle_signature_cluster') {
      const matches = Array.isArray(details?.matches) ? details.matches : [];
      matches.forEach((row) => {
        const rowBattleIds = Array.isArray(row?.battleIds) ? row.battleIds : [];
        rowBattleIds.forEach((battleId) => {
          const safeBattleId = cleanText(battleId);
          if (safeBattleId) battleIds.add(safeBattleId);
        });
      });
    }
  });

  return battleIds;
}

function sanitizeRewardRollbackEntries(rewardRollback = [], evidence = [], userMap = new Map()) {
  const relevantBattleIds = collectRewardRollbackBattleIds(evidence);
  if (!relevantBattleIds.size) return [];

  const grouped = new Map();
  (Array.isArray(rewardRollback) ? rewardRollback : []).forEach((row) => {
    const battleId = cleanText(row?.battleId);
    const userId = cleanText(row?.userId);
    if (!battleId || !userId || !relevantBattleIds.has(battleId)) return;

    const currency = cleanText(row?.currency || 'K') || 'K';
    const status = cleanText(row?.status || 'pending') || 'pending';
    const key = `${userId}:${battleId}:${currency}:${status}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        transactionIds: [],
        userId,
        battleId,
        currency,
        status,
        amount: 0,
        occurredAt: row?.occurredAt || null,
        rolledBackAmount: 0,
        shortfall: 0,
        rolledBackAt: row?.rolledBackAt || null,
        rolledBackBy: row?.rolledBackBy || null,
        rollbackTransactionIds: [],
      });
    }

    const entry = grouped.get(key);
    const transactionId = cleanText(row?.id);
    const sourceTransactionId = cleanText(row?.transactionId || transactionId);
    if (sourceTransactionId) entry.transactionIds.push(sourceTransactionId);
    entry.amount = round(entry.amount + safeNumber(row?.amount), 3);
    entry.rolledBackAmount = round(entry.rolledBackAmount + safeNumber(row?.rolledBackAmount), 3);
    entry.shortfall = round(entry.shortfall + safeNumber(row?.shortfall), 3);
    const rollbackTransactionId = cleanText(row?.rollbackTransactionId);
    if (rollbackTransactionId) entry.rollbackTransactionIds.push(rollbackTransactionId);
    if (!entry.occurredAt || new Date(row?.occurredAt || 0).getTime() > new Date(entry.occurredAt || 0).getTime()) {
      entry.occurredAt = row?.occurredAt || entry.occurredAt || null;
    }
    if (!entry.rolledBackAt || new Date(row?.rolledBackAt || 0).getTime() > new Date(entry.rolledBackAt || 0).getTime()) {
      entry.rolledBackAt = row?.rolledBackAt || entry.rolledBackAt || null;
    }
  });

  return sortByDate(Array.from(grouped.values()).map((row) => {
    const user = userMap.get(cleanText(row?.userId)) || null;
    return {
      transactionId: cleanText(row?.transactionIds?.[0]),
      transactionIds: Array.isArray(row?.transactionIds) ? row.transactionIds : [],
      transactionCount: Array.isArray(row?.transactionIds) ? row.transactionIds.length : 0,
      userId: cleanText(row?.userId),
      userEmail: cleanText(user?.email),
      userNickname: cleanText(user?.nickname),
      battleId: cleanText(row?.battleId),
      amount: round(row?.amount, 3),
      currency: cleanText(row?.currency || 'K') || 'K',
      occurredAt: row?.occurredAt || null,
      status: cleanText(row?.status || 'pending') || 'pending',
      rolledBackAmount: round(row?.rolledBackAmount, 3),
      shortfall: round(row?.shortfall, 3),
      rolledBackAt: row?.rolledBackAt || null,
      rolledBackBy: row?.rolledBackBy || null,
      rollbackTransactionId: cleanText(row?.rollbackTransactionIds?.[0]),
      rollbackTransactionIds: Array.isArray(row?.rollbackTransactionIds) ? row.rollbackTransactionIds : [],
    };
  }), 'occurredAt').reverse().slice(0, 200);
}

function buildRewardRollbackEntries(rewardRows = [], userMap = new Map(), evidence = []) {
  const preparedRows = (Array.isArray(rewardRows) ? rewardRows : []).map((row) => ({
    transactionId: cleanText(row?.id),
    userId: cleanText(row?.userId),
    battleId: cleanText(row?.battleId),
    amount: round(row?.amount, 3),
    currency: cleanText(row?.currency || 'K') || 'K',
    occurredAt: row?.occurredAt || null,
    status: 'pending',
    rolledBackAmount: 0,
    shortfall: 0,
  }));
  return sanitizeRewardRollbackEntries(preparedRows, evidence, userMap);
}

module.exports = {
  buildRewardRollbackEntries,
  collectRewardRollbackBattleIds,
  sanitizeRewardRollbackEntries,
};
