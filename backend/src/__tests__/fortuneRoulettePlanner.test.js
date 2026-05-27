const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ensurePlannedRouletteSpins,
  normalizePlannedRouletteSpin,
} = require('../services/fortune/roulettePlanner');

const now = new Date('2026-05-24T12:00:00.000Z');
const rouletteConfig = {
  minSpinsSinceStar: 21,
  minDaysSinceStar: 7,
  sectors: [
    { label: '10', value: 10, type: 'k', weight: 1, enabled: true },
    { label: '0.1⭐', value: 0.1, type: 'star', weight: 100000, enabled: true },
  ],
};

function withFixedRandom(value, callback) {
  const originalRandom = Math.random;
  Math.random = () => value;

  try {
    return callback();
  } finally {
    Math.random = originalRandom;
  }
}

test('roulette planner does not plan a star for the next spin before the threshold', () => {
  withFixedRandom(0.99, () => {
    const spinData = {
      spinsSinceLastStar: 20,
      lastStarWinAt: null,
      pendingRouletteSpins: [],
    };

    const planned = ensurePlannedRouletteSpins({
      spinData,
      rouletteConfig,
      count: 3,
      now,
    });

    assert.equal(planned.length, 3);
    assert.deepEqual(planned.map((item) => item.result.type), ['k', 'star', 'k']);
  });
});

test('roulette planner resets virtual star cooldown inside the prepared queue', () => {
  withFixedRandom(0.99, () => {
    const spinData = {
      spinsSinceLastStar: 21,
      lastStarWinAt: '2026-05-16T12:00:00.000Z',
      pendingRouletteSpins: [],
    };

    const planned = ensurePlannedRouletteSpins({
      spinData,
      rouletteConfig,
      count: 2,
      now,
    });

    assert.equal(planned.length, 2);
    assert.equal(planned[0].result.type, 'star');
    assert.equal(planned[1].result.type, 'k');
  });
});

test('roulette planner keeps an existing planned star from allowing another immediate star', () => {
  withFixedRandom(0.99, () => {
    const spinData = {
      spinsSinceLastStar: 21,
      lastStarWinAt: '2026-05-16T12:00:00.000Z',
      pendingRouletteSpins: [
        {
          id: 'planned-star',
          sectorIndex: 1,
          result: { label: '0.1⭐', value: 0.1, type: 'star' },
        },
      ],
    };

    const planned = ensurePlannedRouletteSpins({
      spinData,
      rouletteConfig,
      count: 2,
      now,
    });

    assert.equal(planned.length, 2);
    assert.equal(planned[0].result.type, 'star');
    assert.equal(planned[1].result.type, 'k');
  });
});

test('roulette planner normalizes bonus spin value to zero and clamps queue length', () => {
  const normalized = normalizePlannedRouletteSpin({
    id: 'bonus-spin',
    sectorIndex: 5.9,
    result: { label: '+1', value: 999, type: 'spin' },
  });

  assert.equal(normalized.sectorIndex, 5);
  assert.deepEqual(normalized.result, { label: '+1', value: 0, type: 'spin' });

  const spinData = { spinsSinceLastStar: 0, pendingRouletteSpins: [] };
  const planned = ensurePlannedRouletteSpins({
    spinData,
    rouletteConfig: {
      minSpinsSinceStar: 21,
      minDaysSinceStar: 7,
      sectors: [{ label: '10', value: 10, type: 'k', weight: 1, enabled: true }],
    },
    count: 99,
    now,
  });

  assert.equal(planned.length, 30);
});
