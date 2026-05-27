const test = require('node:test');
const assert = require('node:assert/strict');

const {
  RADIANCE_RULES,
  resolveRadianceAmount,
} = require('../config/radianceRules');

test('radiance rules keep news rewards stable', () => {
  assert.equal(resolveRadianceAmount({ activityType: 'news_like' }).amount, 2);
  assert.equal(resolveRadianceAmount({ activityType: 'news_comment' }).amount, 3);
  assert.equal(resolveRadianceAmount({ activityType: 'news_repost' }).amount, 5);
});

test('radiance rules keep gratitude and feedback daily entry limits stable', () => {
  assert.equal(RADIANCE_RULES.gratitude_write.amount, 10);
  assert.equal(RADIANCE_RULES.gratitude_write.dailyLimitEntries, 3);
  assert.equal(RADIANCE_RULES.feedback_letter.amount, 10);
  assert.equal(RADIANCE_RULES.feedback_letter.dailyLimitEntries, 3);
});

test('radiance rules keep meditation individual amount and daily cap stable', () => {
  const result = resolveRadianceAmount({
    activityType: 'meditation_individual',
    meta: { completedBreaths: 150 },
  });

  assert.equal(result.amount, 150);
  assert.equal(result.rule.dailyLimitAmount, 100);
  assert.equal(result.awardStep, 1);
});

test('radiance rules keep referral active daily limit stable', () => {
  const result = resolveRadianceAmount({
    activityType: 'referral_active',
    units: 2,
  });

  assert.equal(result.amount, 40);
  assert.equal(result.rule.dailyLimitEntries, 10);
  assert.equal(result.awardStep, 20);
});

test('radiance rules keep night shift anomaly and hour math stable', () => {
  assert.equal(resolveRadianceAmount({
    activityType: 'night_shift_anomaly',
    meta: { acceptedAnomalies: 7 },
  }).amount, 21);

  assert.equal(resolveRadianceAmount({
    activityType: 'night_shift_hour',
    meta: { payableHours: 3 },
  }).amount, 15);

  assert.equal(resolveRadianceAmount({
    activityType: 'night_shift',
    meta: { acceptedAnomalies: 7, payableHours: 3 },
  }).amount, 36);
});

test('radiance rules keep unknown activity fallback harmless', () => {
  const result = resolveRadianceAmount({
    activityType: 'unknown_activity',
    amount: 12.5,
  });

  assert.equal(result.amount, 12.5);
  assert.equal(result.awardStep, null);
  assert.equal(result.rule, null);
});
