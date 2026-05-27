const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildDeclinedCallPlan,
    getUserRoomNameForCall,
    isExpectedCallResponse,
} = require('../services/socket/socketCallResponse');

test('socket call response keeps strict pending caller match', () => {
    assert.equal(isExpectedCallResponse('u1', 'u1'), true);
    assert.equal(isExpectedCallResponse('u1', 'u2'), false);
    assert.equal(isExpectedCallResponse(1, '1'), false);
    assert.equal(isExpectedCallResponse(null, 'u1'), false);
});

test('socket call response builds user room name for declined call', () => {
    assert.equal(getUserRoomNameForCall('abc'), 'user-abc');
    assert.equal(getUserRoomNameForCall(12), 'user-12');
});

test('socket call response plans declined call without decliner search session', () => {
    assert.deepEqual(buildDeclinedCallPlan('decliner', 'caller', false), {
        cooldownUserId: 'decliner',
        cooldownSeconds: 30,
        declinedRoom: 'user-caller',
        continueSearchUserIds: ['caller'],
    });
});

test('socket call response plans declined call with decliner search session', () => {
    assert.deepEqual(buildDeclinedCallPlan('decliner', 'caller', true), {
        cooldownUserId: 'decliner',
        cooldownSeconds: 30,
        declinedRoom: 'user-caller',
        continueSearchUserIds: ['caller', 'decliner'],
    });
});
