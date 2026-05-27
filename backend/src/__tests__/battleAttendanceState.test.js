const test = require('node:test');
const assert = require('node:assert/strict');

const { buildVoiceResolutionUpdate } = require('../services/battle/battleAttendanceState');
const { getVoiceCommandForBucket } = require('../services/battle/battleScenario');

function makeBattle() {
  return {
    _id: 'battle_voice_test',
    startsAt: '2026-01-01T00:00:00.000Z',
    durationSeconds: 3600,
  };
}

test('battle voice resolution waits until command window is closed', () => {
  const battle = makeBattle();
  const command = getVoiceCommandForBucket(battle, 0, 'user1');
  const result = buildVoiceResolutionUpdate({
    battle,
    attendanceEntry: {},
    at: new Date(command.startAt),
    userId: 'user1',
  });

  assert.equal(result.update, null);
});

test('battle voice resolution records successful command without changing contract keys', () => {
  const battle = makeBattle();
  const command = getVoiceCommandForBucket(battle, 0, 'user1');
  const result = buildVoiceResolutionUpdate({
    battle,
    attendanceEntry: {
      voiceShotDetectedBucket: command.requireShot ? 1 : 0,
    },
    at: new Date(command.endsAt + 1),
    userId: 'user1',
  });

  assert.ok(result.update);
  const patch = result.update.$set;
  assert.equal(patch['attendance.$.voiceLastResolvedBucket'], 1);
  assert.equal(patch['attendance.$.voiceCommandsSuccess'], 1);
  assert.equal(patch['attendance.$.voiceCommandsConsecutive'], 1);
  assert.equal(patch['attendance.$.voiceCommandsTotalAttempts'], 1);
  assert.deepEqual(patch['attendance.$.voiceCommandsHistory'], [true]);

  if (command.text === 'СТРЕЛЯЙ') {
    assert.equal(patch['attendance.$.voiceCommandsSilenceSuccess'], 1);
    assert.equal(patch['attendance.$.voiceCommandsAttackSuccess'], 0);
  } else {
    assert.equal(patch['attendance.$.voiceCommandsSilenceSuccess'], 0);
    assert.equal(patch['attendance.$.voiceCommandsAttackSuccess'], 1);
  }
});

test('battle voice resolution records failed command and resets consecutive counter', () => {
  const battle = makeBattle();
  const command = getVoiceCommandForBucket(battle, 0, 'user1');
  const result = buildVoiceResolutionUpdate({
    battle,
    attendanceEntry: {
      voiceCommandsSuccess: 2,
      voiceCommandsConsecutive: 3,
      voiceCommandsTotalAttempts: 4,
      voiceCommandsHistory: [true, true],
      voiceShotDetectedBucket: command.requireShot ? 0 : 1,
    },
    at: new Date(command.endsAt + 1),
    userId: 'user1',
  });

  assert.ok(result.update);
  const patch = result.update.$set;
  assert.equal(patch['attendance.$.voiceLastResolvedBucket'], 1);
  assert.equal(patch['attendance.$.voiceCommandsSuccess'], 2);
  assert.equal(patch['attendance.$.voiceCommandsConsecutive'], 0);
  assert.equal(patch['attendance.$.voiceCommandsTotalAttempts'], 5);
  assert.deepEqual(patch['attendance.$.voiceCommandsHistory'], [true, true, false]);
});
