const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createNightShiftHeartbeat,
  evaluateCompletedHours,
  getHourIndex,
  getWindowIndex,
  hasHourEvaluationChanged,
  parseHeartbeatPayload,
  parseHourCheckpointPayload,
} = require('../services/nightShift/nightShiftHeartbeat');

test('night shift heartbeat parses window and hour indexes', () => {
  const runtime = {
    startedAt: '2026-05-25T19:00:00.000Z',
  };

  const parsed = parseHeartbeatPayload(runtime, {
    windowStartedAt: '2026-05-25T20:00:00.000Z',
    anomalyCount: '7',
    pageHits: { '/ru/tree': '2' },
  });

  assert.equal(getHourIndex(Date.parse(runtime.startedAt), Date.parse('2026-05-25T21:00:00.000Z')), 2);
  assert.equal(getWindowIndex(Date.parse(runtime.startedAt), Date.parse('2026-05-25T20:00:00.000Z')), 12);
  assert.equal(parsed.index, 12);
  assert.equal(parsed.hourIndex, 1);
  assert.equal(parsed.anomalyCount, 7);
  assert.deepEqual(parsed.pageHits, { '/tree': 2 });
});

test('night shift heartbeat validates hourly checkpoint payloads', () => {
  assert.deepEqual(parseHourCheckpointPayload({ index: 10, hourIndex: 0 }, {}), {
    present: false,
    hourIndex: 0,
    anomalyCount: 0,
  });
  assert.equal(parseHourCheckpointPayload({ index: 11, hourIndex: 0 }, {}), null);
  assert.deepEqual(parseHourCheckpointPayload({ index: 11, hourIndex: 0 }, {
    hourIndex: 0,
    hourAnomalyCount: '60',
  }), {
    present: true,
    hourIndex: 0,
    anomalyCount: 60,
  });
  assert.equal(parseHourCheckpointPayload({ index: 11, hourIndex: 0 }, {
    hourIndex: 1,
    hourAnomalyCount: 60,
  }), null);
});

test('night shift heartbeat detects changed completed hour evaluation', () => {
  const runtime = {
    startedAt: '2026-05-25T19:00:00.000Z',
    evaluatedHours: [],
    payableHours: 0,
    hourlyAnomalies: { 0: 60 },
  };
  const evaluated = evaluateCompletedHours(runtime, Date.parse('2026-05-25T20:00:00.000Z'));

  assert.equal(evaluated.payableHours, 1);
  assert.deepEqual(evaluated.evaluatedHours, [0]);
  assert.equal(hasHourEvaluationChanged(runtime, evaluated), true);
  assert.equal(hasHourEvaluationChanged({
    ...runtime,
    evaluatedHours: [0],
    payableHours: 1,
  }, evaluated), false);
});

test('night shift heartbeat syncs completed hours through injected store', async () => {
  const calls = [];
  const { syncCompletedHours } = createNightShiftHeartbeat({
    updateRuntimeSessionFast: async (sessionId, runtime, options) => {
      calls.push({ sessionId, runtime, options });
      return runtime;
    },
  });

  const runtime = {
    sessionId: 'session-1',
    userId: 'user-1',
    status: 'active',
    startedAt: '2026-05-25T19:00:00.000Z',
    evaluatedHours: [],
    payableHours: 0,
    hourlyAnomalies: { 0: 60 },
  };
  const updatedAt = new Date('2026-05-25T20:00:00.000Z');

  const synced = await syncCompletedHours(runtime, Date.parse('2026-05-25T20:00:00.000Z'), updatedAt);

  assert.equal(synced.changed, true);
  assert.equal(synced.runtime.payableHours, 1);
  assert.deepEqual(calls, [{
    sessionId: 'session-1',
    runtime: synced.runtime,
    options: { updatedAt },
  }]);
});
