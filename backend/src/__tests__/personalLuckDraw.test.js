const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildPersonalLuckBoostOfferPayload,
  buildPersonalLuckRadiancePayload,
  normalizePersonalLuckCreditedAmount,
} = require('../services/fortune/personalLuckDraw');

test('personal luck normalizes credited reward amount', () => {
  assert.equal(normalizePersonalLuckCreditedAmount(null, 25), 0);
  assert.equal(normalizePersonalLuckCreditedAmount({ creditedAmount: 12 }, 25), 12);
  assert.equal(normalizePersonalLuckCreditedAmount({ creditedAmount: -5 }, 25), 0);
  assert.equal(normalizePersonalLuckCreditedAmount({ creditedAmount: 'bad' }, 25), 25);
});

test('personal luck builds stable radiance payload', () => {
  assert.deepEqual(buildPersonalLuckRadiancePayload({
    userId: 'u1',
    dayStart: new Date('2026-05-25T00:00:00.000Z'),
  }), {
    userId: 'u1',
    amount: 5,
    activityType: 'personal_luck',
    meta: { day: '2026-05-25' },
    dedupeKey: 'personal_luck:u1:2026-05-25',
  });
});

test('personal luck boost offer keeps old reward contract', () => {
  const payload = buildPersonalLuckBoostOfferPayload({
    userId: 'u1',
    now: new Date('2026-05-25T12:00:00.000Z'),
    creditedAmount: 17,
    userLang: 'en',
  });

  assert.equal(payload.type, 'personal_luck_double');
  assert.equal(payload.contextKey, 'personal_luck_double:u1:2026-05-25');
  assert.equal(payload.page, 'fortune');
  assert.deepEqual(payload.reward, {
    kind: 'currency',
    k: 17,
    transactionType: 'personal_luck_ad_reward',
    description: 'Extra reward: Personal luck',
  });
});
