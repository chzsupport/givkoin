const test = require('node:test');
const assert = require('node:assert/strict');

const {
  addOnlineUser,
  getOnlineUserCount,
  getOnlineUserIds,
  isUserOnline,
  removeOnlineUser,
  resetOnlineUsers,
} = require('../services/socket/socketOnlineUsers');

test('socket online users add remove and list normalized ids', () => {
  resetOnlineUsers();

  assert.equal(addOnlineUser(null), false);
  assert.equal(addOnlineUser(42), true);
  assert.equal(addOnlineUser('u1'), true);
  assert.equal(isUserOnline('42'), true);
  assert.equal(isUserOnline('u1'), true);
  assert.deepEqual(getOnlineUserIds(), ['42', 'u1']);

  assert.equal(removeOnlineUser(42), true);
  assert.equal(isUserOnline('42'), false);
});

test('socket online users count falls back to internal state without room adapter', () => {
  resetOnlineUsers();
  addOnlineUser('u1');
  addOnlineUser('u2');

  assert.equal(getOnlineUserCount(null), 2);
});

test('socket online users count prefers active user rooms when io is provided', () => {
  resetOnlineUsers();
  addOnlineUser('u1');

  const io = {
    sockets: {
      adapter: {
        rooms: new Map([
          ['user-a', { size: 1 }],
          ['user-b', { size: 2 }],
          ['chat-a', { size: 10 }],
        ]),
      },
    },
  };

  assert.equal(getOnlineUserCount(io), 2);
});

test('socket online users reset clears internal state', () => {
  resetOnlineUsers();
  addOnlineUser('u1');
  resetOnlineUsers();

  assert.equal(isUserOnline('u1'), false);
  assert.deepEqual(getOnlineUserIds(), []);
});
