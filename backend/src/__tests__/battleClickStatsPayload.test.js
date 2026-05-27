const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildBattleClickStatsUpdate,
    sanitizeShotTelemetry,
    sanitizeWorldPoint,
} = require('../controllers/battle/clickStatsPayload');

test('battle click stats sanitizes world point and telemetry bounds', () => {
    assert.deepEqual(sanitizeWorldPoint({ x: '1', y: 2, z: 3 }), { x: 1, y: 2, z: 3 });
    assert.equal(sanitizeWorldPoint({ x: 'bad', y: 2, z: 3 }), null);

    const telemetry = sanitizeShotTelemetry({
        intervalMs: -5,
        cursorDistancePx: 12,
        screenNx: 2,
        screenNy: -1,
        staticCursor: true,
        isTabHidden: false,
        inputSource: 'mouse-touch-keyboard',
        worldPoint: { x: 1, y: 2, z: 3 },
    });

    assert.equal(telemetry.intervalMs, 0);
    assert.equal(telemetry.cursorDistancePx, 12);
    assert.equal(telemetry.screenNx, 1);
    assert.equal(telemetry.screenNy, 0);
    assert.equal(telemetry.staticCursor, true);
    assert.equal(telemetry.inputSource, 'mouse-touch-keyboard');
    assert.deepEqual(telemetry.worldPoint, { x: 1, y: 2, z: 3 });
});

test('battle click stats builds update for weapons and telemetry', () => {
    const update = buildBattleClickStatsUpdate({
        snapshotEntry: {
            lastClickAt: new Date('2026-01-01T00:00:00.000Z'),
            maxClickGapMs: 100,
            automationTelemetry: {
                screenMinNx: 0.4,
                screenMaxNx: 0.6,
                screenMinNy: 0.4,
                screenMaxNy: 0.6,
            },
        },
        events: [
            {
                at: new Date('2026-01-01T00:00:01.000Z'),
                weaponId: 2,
                telemetry: {
                    intervalMs: 16,
                    cursorDistancePx: 5,
                    screenNx: 0.2,
                    screenNy: 0.8,
                    staticCursor: true,
                    isTabHidden: true,
                    inputSource: 'mouse',
                },
            },
            {
                at: new Date('2026-01-01T00:00:03.500Z'),
                weaponId: 3,
                telemetry: null,
            },
        ],
    });

    assert.equal(update.inc['attendance.$.weapon2Hits'], 1);
    assert.equal(update.inc['attendance.$.weapon3Hits'], 1);
    assert.equal(update.inc['attendance.$.automationTelemetry.shotTelemetryCount'], 1);
    assert.equal(update.inc['attendance.$.automationTelemetry.staticCursorShots'], 1);
    assert.equal(update.inc['attendance.$.automationTelemetry.hiddenTabShotCount'], 1);
    assert.equal(update.inc['attendance.$.automationTelemetry.intervalCount'], 1);
    assert.equal(update.set['attendance.$.maxClickGapMs'], 2500);
    assert.equal(update.set['attendance.$.automationTelemetry.screenMinNx'], 0.2);
    assert.equal(update.set['attendance.$.automationTelemetry.screenMaxNy'], 0.8);
});

test('battle click stats returns null without events', () => {
    assert.equal(buildBattleClickStatsUpdate({ events: [] }), null);
});
