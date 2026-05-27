async function runInBatches(items, batchSize, handler) {
  const safeItems = Array.isArray(items) ? items : [];
  const safeBatchSize = Math.max(1, Number(batchSize) || 1);
  for (let offset = 0; offset < safeItems.length; offset += safeBatchSize) {
    // Keep concurrency bounded so one finished battle does not create a thundering herd.
    // eslint-disable-next-line no-await-in-loop
    await Promise.all(safeItems.slice(offset, offset + safeBatchSize).map(handler));
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retryBattleSideEffect(action, { attempts = 5, delayMs = 250 } = {}) {
  const safeAttempts = Math.max(1, Math.floor(Number(attempts) || 1));
  const safeDelayMs = Math.max(0, Math.floor(Number(delayMs) || 0));
  let lastError = null;

  for (let attempt = 1; attempt <= safeAttempts; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const result = await action(attempt);
      if (result != null) return result;
    } catch (error) {
      lastError = error;
    }

    if (attempt < safeAttempts && safeDelayMs > 0) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(safeDelayMs * attempt);
    }
  }

  if (lastError) throw lastError;
  return null;
}

function randBetween(min, max) {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return lo + Math.random() * (hi - lo);
}

module.exports = {
  randBetween,
  retryBattleSideEffect,
  runInBatches,
  sleep,
};
