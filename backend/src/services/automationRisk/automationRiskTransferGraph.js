const { safeNumber } = require('./automationRiskScoring');

function ensureGraphBucket(graph, direction, userId) {
  if (!graph[direction].has(userId)) {
    graph[direction].set(
      userId,
      direction === 'outbound'
        ? { totalLm: 0, recipients: new Map() }
        : { totalLm: 0, senders: new Map() },
    );
  }
  return graph[direction].get(userId);
}

function appendTransferGraphActivity(graph, row) {
  if (!graph || String(row?.type || '').trim() !== 'solar_share') return;
  const senderId = String(row?.user || '');
  const recipientId = String(row?.meta?.recipientId || '');
  const amountLm = Math.max(0, safeNumber(row?.meta?.amountLm));
  if (!senderId || !recipientId || !amountLm) return;

  const outRow = ensureGraphBucket(graph, 'outbound', senderId);
  outRow.totalLm += amountLm;
  const recipientEntry = outRow.recipients.get(recipientId) || {
    totalLm: 0,
    count: 0,
    lastAt: row.createdAt,
  };
  recipientEntry.totalLm += amountLm;
  recipientEntry.count += 1;
  recipientEntry.lastAt = row.createdAt;
  outRow.recipients.set(recipientId, recipientEntry);

  const inRow = ensureGraphBucket(graph, 'inbound', recipientId);
  inRow.totalLm += amountLm;
  const senderEntry = inRow.senders.get(senderId) || {
    totalLm: 0,
    count: 0,
    lastAt: row.createdAt,
  };
  senderEntry.totalLm += amountLm;
  senderEntry.count += 1;
  senderEntry.lastAt = row.createdAt;
  inRow.senders.set(senderId, senderEntry);
}

function buildTransferGraph(activities = []) {
  const graph = {
    outbound: new Map(),
    inbound: new Map(),
  };

  for (const row of activities) {
    appendTransferGraphActivity(graph, row);
  }

  return graph;
}

module.exports = {
  appendTransferGraphActivity,
  buildTransferGraph,
};
