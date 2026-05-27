const test = require('node:test');
const assert = require('node:assert/strict');

const {
    applyAttendancePayloadToRuntimeEntry,
    cloneRuntimeEntry,
    getRuntimeEntryValue,
    mergeUpdatePayload,
    normalizeAttendanceRuntimePath,
    setRuntimeEntryValue,
} = require('../controllers/battle/runtimeEntryPayload');

test('battle runtime entry payload strips attendance prefix', () => {
    assert.equal(normalizeAttendanceRuntimePath('attendance.$.reported.damage'), 'reported.damage');
    assert.equal(normalizeAttendanceRuntimePath('damage'), 'damage');
});

test('battle runtime entry payload applies inc and set without mutating source', () => {
    const entry = {
        damage: 10,
        reported: {
            hits: 2,
        },
    };
    const next = applyAttendancePayloadToRuntimeEntry(entry, {
        $inc: {
            'attendance.$.damage': 5,
            'attendance.$.reported.hits': 3,
        },
        $set: {
            'attendance.$.lastClientSyncAt': '2026-01-01T00:00:00.000Z',
            'attendance.$.reported.voice.success': true,
        },
    });

    assert.equal(entry.damage, 10);
    assert.equal(entry.reported.hits, 2);
    assert.equal(next.damage, 15);
    assert.equal(next.reported.hits, 5);
    assert.equal(next.lastClientSyncAt, '2026-01-01T00:00:00.000Z');
    assert.equal(next.reported.voice.success, true);
});

test('battle runtime entry payload reads and writes nested values', () => {
    const entry = {};
    setRuntimeEntryValue(entry, 'attendance.$.reported.damage', 42);

    assert.equal(getRuntimeEntryValue(entry, 'reported.damage'), 42);
    assert.deepEqual(entry, { reported: { damage: 42 } });
});

test('battle runtime entry payload merges update payloads', () => {
    const target = {
        $inc: { damage: 2 },
        $set: { a: 1 },
    };
    const merged = mergeUpdatePayload(target, {
        $inc: { damage: 3, hits: 1 },
        $set: { b: 2 },
    });

    assert.equal(merged, target);
    assert.deepEqual(merged, {
        $inc: { damage: 5, hits: 1 },
        $set: { a: 1, b: 2 },
    });
});

test('battle runtime entry clone keeps object independent', () => {
    const entry = { nested: { value: 1 } };
    const cloned = cloneRuntimeEntry(entry);
    cloned.nested.value = 2;

    assert.equal(entry.nested.value, 1);
    assert.equal(cloned.nested.value, 2);
});
