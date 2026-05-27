const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildSocketMessage,
  buildSocketMessageKey,
  getSocketSiteLanguage,
  pickSocketText,
} = require('../services/socket/socketMessages');

test('socket messages choose language from socket data with ru fallback', () => {
  assert.equal(getSocketSiteLanguage({ data: { siteLanguage: 'en' } }), 'en');
  assert.equal(getSocketSiteLanguage({ data: { siteLanguage: 'de' } }), 'ru');
  assert.equal(getSocketSiteLanguage(null), 'ru');
});

test('socket messages keep old payload shape with message text', () => {
  const socket = { data: { siteLanguage: 'en' } };

  assert.equal(pickSocketText(socket, 'Привет', 'Hello'), 'Hello');
  assert.deepEqual(buildSocketMessage(socket, 'hello.key', 'Привет', 'Hello', { chatId: 'c1' }), {
    chatId: 'c1',
    messageKey: 'hello.key',
    message: 'Hello',
  });
});

test('socket message key payload keeps extra fields without text', () => {
  assert.deepEqual(buildSocketMessageKey('chat.resumed', { chatId: 'c1' }), {
    chatId: 'c1',
    messageKey: 'chat.resumed',
  });
});
