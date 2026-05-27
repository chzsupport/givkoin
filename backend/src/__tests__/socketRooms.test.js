const test = require('node:test');
const assert = require('node:assert/strict');

const {
  countUserRooms,
  getUserRoomName,
  hasUserRoom,
  normalizeUserId,
} = require('../services/socket/socketRooms');

test('socket rooms normalize user ids and build room names', () => {
  assert.equal(normalizeUserId(null), '');
  assert.equal(normalizeUserId(undefined), '');
  assert.equal(normalizeUserId(42), '42');
  assert.equal(normalizeUserId('u1'), 'u1');
  assert.equal(getUserRoomName(42), 'user-42');
});

test('socket rooms count only non-empty user rooms', () => {
  const io = {
    sockets: {
      adapter: {
        rooms: new Map([
          ['user-a', new Set(['s1'])],
          ['user-b', new Set()],
          ['chat-c', new Set(['s2'])],
          ['user-c', { size: 2 }],
        ]),
      },
    },
  };

  assert.equal(countUserRooms(io), 2);
  assert.equal(countUserRooms(null), null);
});

test('socket rooms detect room through socket.io allSockets API first', async () => {
  const io = {
    in(roomName) {
      assert.equal(roomName, 'user-u1');
      return {
        async allSockets() {
          return new Set(['socket-1']);
        },
      };
    },
  };

  assert.equal(await hasUserRoom(io, 'u1'), true);
});

test('socket rooms fallback to adapter room map when allSockets fails', async () => {
  const io = {
    in() {
      throw new Error('adapter unavailable');
    },
    sockets: {
      adapter: {
        rooms: new Map([
          ['user-u1', { size: 1 }],
        ]),
      },
    },
  };

  assert.equal(await hasUserRoom(io, 'u1'), true);
  assert.equal(await hasUserRoom(io, ''), false);
});
