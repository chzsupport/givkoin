const test = require('node:test');
const assert = require('node:assert/strict');

const {
  randBetween,
  retryBattleSideEffect,
  runInBatches,
} = require('../services/battle/battleAsync');

test('battle batch helper processes all items in bounded chunks', async () => {
  const batches = [];

  await runInBatches([1, 2, 3, 4, 5], 2, async (item) => {
    batches.push(item);
  });

  assert.deepEqual(batches.sort((a, b) => a - b), [1, 2, 3, 4, 5]);
});

test('battle side effect retry returns first non-null result', async () => {
  const attempts = [];

  const result = await retryBattleSideEffect(async (attempt) => {
    attempts.push(attempt);
    if (attempt < 3) return null;
    return 'done';
  }, { attempts: 5, delayMs: 0 });

  assert.equal(result, 'done');
  assert.deepEqual(attempts, [1, 2, 3]);
});

test('battle side effect retry rethrows last error', async () => {
  await assert.rejects(
    retryBattleSideEffect(async () => {
      throw new Error('side effect failed');
    }, { attempts: 2, delayMs: 0 }),
    /side effect failed/
  );
});

test('battle random helper keeps value inside requested range', () => {
  for (let i = 0; i < 20; i += 1) {
    const value = randBetween(10, 5);
    assert.ok(value >= 5);
    assert.ok(value <= 10);
  }
});
