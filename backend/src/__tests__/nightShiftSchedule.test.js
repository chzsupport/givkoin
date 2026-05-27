const test = require('node:test');
const assert = require('node:assert/strict');

const {
  formatShiftKey,
  getShiftScheduleSnapshot,
  getShiftWindow,
  getShiftWindowByKey,
  isShiftRestRequired,
} = require('../services/nightShift/nightShiftSchedule');
const {
  normalizeNightShiftSalary,
} = require('../services/nightShift/nightShiftRewards');

test('night shift schedule keeps evening shift open until next morning', () => {
  const window = getShiftWindow(new Date(2026, 4, 24, 20, 15, 0, 0));

  assert.equal(window.key, '2026-05-24');
  assert.equal(window.isOpen, true);
  assert.equal(window.startAt.getHours(), 19);
  assert.equal(window.endAt.getHours(), 6);
  assert.equal(formatShiftKey(window.endAt), '2026-05-25');
});

test('night shift schedule maps early morning to previous shift key', () => {
  const window = getShiftWindow(new Date(2026, 4, 25, 5, 30, 0, 0));

  assert.equal(window.key, '2026-05-24');
  assert.equal(window.isOpen, true);
  assert.equal(window.startAt.getHours(), 19);
  assert.equal(window.endAt.getHours(), 6);
});

test('night shift schedule exposes closed daytime window and rest rule', () => {
  const now = new Date(2026, 4, 25, 12, 0, 0, 0);
  const window = getShiftWindow(now);
  const restored = getShiftWindowByKey('2026-05-25');
  const snapshot = getShiftScheduleSnapshot(now);

  assert.equal(window.key, '2026-05-25');
  assert.equal(window.isOpen, false);
  assert.equal(restored.key, '2026-05-25');
  assert.equal(snapshot.isOpen, false);
  assert.equal(isShiftRestRequired('2026-05-24', '2026-05-25'), true);
  assert.equal(isShiftRestRequired('2026-05-23', '2026-05-25'), false);
});

test('night shift salary normalization keeps current defaults and custom values', () => {
  assert.deepEqual(normalizeNightShiftSalary(null), { k: 100, lm: 100, stars: 0.001 });
  assert.deepEqual(normalizeNightShiftSalary({ k: 10, lm: 50, stars: 0.01 }), { k: 100, lm: 100, stars: 0.001 });
  assert.deepEqual(normalizeNightShiftSalary({ k: 120, lm: 80, stars: 0.002 }), { k: 120, lm: 80, stars: 0.002 });
});
