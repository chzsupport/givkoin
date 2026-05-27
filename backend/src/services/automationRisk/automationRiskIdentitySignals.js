const {
  addSignal,
  normalizeSignalValue,
} = require('./automationRiskScoring');
const {
  collectDuplicates,
} = require('./automationRiskSignalMaps');

function evaluateIdentitySignals(ctx, { usersById, maps, referralsByInviter, existingCaseByUser }) {
  const userId = String(ctx.user?._id || '');
  const duplicateSignals = [
    {
      label: 'shared_device',
      map: maps.device,
      value: normalizeSignalValue(ctx.user?.lastDeviceId),
      base: 18,
      perUser: 7,
      cap: 44,
    },
    {
      label: 'shared_fingerprint',
      map: maps.fingerprint,
      value: normalizeSignalValue(ctx.user?.lastFingerprint),
      base: 20,
      perUser: 8,
      cap: 48,
    },
  ];

  for (const entry of duplicateSignals) {
    const relatedIds = collectDuplicates(entry.map, entry.value, userId);
    if (!relatedIds.length) continue;
    addSignal(ctx, {
      signal: `${entry.label}:${entry.value}`,
      score: Math.min(entry.cap, entry.base + relatedIds.length * entry.perUser),
      category: 'identity',
      summary: `${relatedIds.length} аккаунтов совпадают по ${entry.label === 'shared_device' ? 'deviceId' : 'fingerprint'}`,
      happenedAt: new Date(),
      relatedUsers: relatedIds,
      meta: {
        value: entry.value,
        relatedCount: relatedIds.length,
      },
    });

    const bannedLinks = relatedIds.filter((id) => usersById.get(id)?.status === 'banned');
    if (bannedLinks.length) {
      addSignal(ctx, {
        signal: 'linked_banned_account',
        score: Math.min(25, 10 + bannedLinks.length * 5),
        category: 'identity',
        summary: `${bannedLinks.length} связанных аккаунтов уже заблокированы`,
        happenedAt: new Date(),
        relatedUsers: bannedLinks,
      });
    }

    const penalizedLinks = relatedIds.filter((id) => existingCaseByUser.get(id)?.status === 'penalized');
    if (penalizedLinks.length) {
      addSignal(ctx, {
        signal: 'linked_penalized_account',
        score: Math.min(28, 12 + penalizedLinks.length * 6),
        category: 'identity',
        summary: `${penalizedLinks.length} связанных аккаунтов уже были оштрафованы за автоматизацию`,
        happenedAt: new Date(),
        relatedUsers: penalizedLinks,
      });
    }
  }

  const dupEmailNorm = collectDuplicates(
    maps.emailNormalized,
    normalizeSignalValue(ctx.user?.emailNormalized),
    userId,
  );
  if (dupEmailNorm.length) {
    addSignal(ctx, {
      signal: 'email_normalized_collision',
      score: Math.min(28, 10 + dupEmailNorm.length * 6),
      category: 'identity',
      summary: `Совпадение нормализованного email с ${dupEmailNorm.length} аккаунтами`,
      happenedAt: new Date(),
      relatedUsers: dupEmailNorm,
    });
  }

  const dupNickNorm = collectDuplicates(
    maps.nicknameNormalized,
    normalizeSignalValue(ctx.user?.nicknameNormalized),
    userId,
  );
  if (dupNickNorm.length) {
    addSignal(ctx, {
      signal: 'nickname_normalized_collision',
      score: Math.min(18, 6 + dupNickNorm.length * 4),
      category: 'identity',
      summary: `Совпадение шаблона ника с ${dupNickNorm.length} аккаунтами`,
      happenedAt: new Date(),
      relatedUsers: dupNickNorm,
    });
  }

  const inviterId = ctx.user?.referredBy ? String(ctx.user.referredBy) : '';
  const invitees = inviterId ? Array.from(referralsByInviter.get(inviterId) || []) : [];
  if (invitees.length >= 3) {
    addSignal(ctx, {
      signal: `referral_cluster:${inviterId}`,
      score: Math.min(20, 8 + invitees.length * 2),
      category: 'identity',
      summary: `Реферальный кластер из ${invitees.length} аккаунтов`,
      happenedAt: new Date(),
      relatedUsers: invitees.filter((id) => id !== userId),
      meta: { inviterId, invitees: invitees.length },
    });
  }
}

module.exports = {
  evaluateIdentitySignals,
};
