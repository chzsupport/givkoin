const { createSignalHistoryEntry } = require('../signalHistoryService');
const { buildSignals } = require('./signals');

function cleanText(value) {
  return String(value || '').trim();
}

function createSignalRecorder(deps = {}) {
  const createEntry = deps.createSignalHistoryEntry || createSignalHistoryEntry;

  async function recordSignalHistory({
    userId,
    eventType,
    signals,
    ipIntel,
    meta,
  }) {
    if (!userId || !eventType) return null;
    const prepared = buildSignals({
      ...signals,
      ipIntel,
    });
    return createEntry({
      userId,
      eventType,
      signals: prepared,
      ipIntel,
      meta: {
        ...(meta && typeof meta === 'object' ? meta : {}),
        profileKey: cleanText(prepared.profileKey),
        clientProfile: prepared.clientProfile && typeof prepared.clientProfile === 'object'
          ? prepared.clientProfile
          : null,
      },
    });
  }

  return {
    recordSignalHistory,
  };
}

module.exports = {
  ...createSignalRecorder(),
  createSignalRecorder,
};
