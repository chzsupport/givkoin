const {
  addSignal,
  clamp,
  round,
} = require('./automationRiskScoring');

function evaluateEconomicSignals(ctx, transferGraph, now = new Date()) {
  const userId = String(ctx.user?._id || '');
  if (!userId || !transferGraph) return;

  const relatedIds = new Set(Array.from(ctx.relatedUsers || []));
  const outbound = transferGraph.outbound.get(userId);
  if (outbound && outbound.totalLm >= 60) {
    const topRecipient = Array.from(outbound.recipients.entries())
      .sort((a, b) => b[1].totalLm - a[1].totalLm || b[1].count - a[1].count)[0];
    if (topRecipient) {
      const [recipientId, recipientStats] = topRecipient;
      const ratio = outbound.totalLm ? recipientStats.totalLm / outbound.totalLm : 0;
      if (relatedIds.has(recipientId) && recipientStats.count >= 3 && ratio >= 0.75) {
        addSignal(ctx, {
          signal: 'benefit_funneling_sender',
          score: clamp(10 + Math.round(recipientStats.totalLm / 20) + recipientStats.count * 2, 10, 28),
          category: 'economy',
          summary: `Основная часть переводов Люменов уходит на один связанный аккаунт (${recipientStats.totalLm} Lm)`,
          happenedAt: recipientStats.lastAt || now,
          relatedUsers: [recipientId],
          meta: {
            totalOutboundLm: round(outbound.totalLm, 3),
            dominantRecipientLm: round(recipientStats.totalLm, 3),
            dominantRecipientCount: recipientStats.count,
            dominantRatio: round(ratio, 4),
          },
        });
      }
    }
  }

  const inbound = transferGraph.inbound.get(userId);
  if (inbound && inbound.totalLm >= 80) {
    const relatedSenders = Array.from(inbound.senders.entries())
      .filter(([senderId]) => relatedIds.has(senderId))
      .sort((a, b) => b[1].totalLm - a[1].totalLm || b[1].count - a[1].count);
    const totalRelatedLm = relatedSenders.reduce((sum, [, row]) => sum + row.totalLm, 0);
    if (relatedSenders.length >= 2 && totalRelatedLm >= 80) {
      addSignal(ctx, {
        signal: 'benefit_funneling_receiver',
        score: clamp(12 + relatedSenders.length * 4 + Math.round(totalRelatedLm / 25), 12, 30),
        category: 'economy',
        summary: `Связанные аккаунты сливают выгоду на этот аккаунт (${round(totalRelatedLm, 3)} Lm)`,
        happenedAt: relatedSenders[0]?.[1]?.lastAt || now,
        relatedUsers: relatedSenders.map(([senderId]) => senderId),
        meta: {
          relatedSenders: relatedSenders.map(([senderId, row]) => ({
            userId: senderId,
            totalLm: round(row.totalLm, 3),
            count: row.count,
          })),
          totalInboundLm: round(inbound.totalLm, 3),
          totalRelatedLm: round(totalRelatedLm, 3),
        },
      });
    }
  }
}

module.exports = {
  evaluateEconomicSignals,
};
