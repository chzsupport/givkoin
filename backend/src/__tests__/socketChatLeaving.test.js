const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildLeftWaitingPayload,
    getLivesAfterPenalty,
    shouldDeductLifeOnLeave,
    shouldDeductLifeWhileWaiting,
} = require('../services/socket/socketChatLeaving');

test('socket chat leaving deducts life only for early non-friend leave', () => {
    assert.equal(shouldDeductLifeOnLeave({ duration: 299, isFriends: false }), true);
    assert.equal(shouldDeductLifeOnLeave({ duration: 300, isFriends: false }), false);
    assert.equal(shouldDeductLifeOnLeave({ duration: 10, isFriends: true }), false);
});

test('socket chat leaving deducts life while waiting only in strict non-friend mode', () => {
    assert.equal(shouldDeductLifeWhileWaiting({ isFriends: false, isStrictWaiting: true }), true);
    assert.equal(shouldDeductLifeWhileWaiting({ isFriends: false, isStrictWaiting: false }), false);
    assert.equal(shouldDeductLifeWhileWaiting({ isFriends: true, isStrictWaiting: true }), false);
});

test('socket chat leaving clamps lives after penalty', () => {
    assert.equal(getLivesAfterPenalty({ lives: 5 }), 4);
    assert.equal(getLivesAfterPenalty({ lives: 1 }), 0);
    assert.equal(getLivesAfterPenalty({ lives: 0 }), 0);
    assert.equal(getLivesAfterPenalty({ lives: 'bad' }), 0);
});

test('socket chat leaving builds left waiting payload', () => {
    assert.deepEqual(
        buildLeftWaitingPayload({ duration: 123, lifeDeducted: true }),
        {
            reason: 'left_waiting',
            duration: 123,
            lifeDeducted: true,
        }
    );
});
