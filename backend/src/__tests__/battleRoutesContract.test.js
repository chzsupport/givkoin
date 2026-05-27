const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function readBattleRoutesSource() {
  return fs.readFileSync(
    path.join(__dirname, '..', 'routes', 'battles.js'),
    'utf8'
  );
}

test('battle routes keep the old public endpoints and handlers', () => {
  const source = readBattleRoutesSource();
  const expectedRoutes = [
    { method: 'get', path: '/current', handler: 'getCurrentBattle' },
    { method: 'post', path: '/join', handler: 'joinBattle' },
    { method: 'post', path: '/heartbeat', handler: 'battleHeartbeat' },
    { method: 'get', path: '/history', handler: 'getUserBattleHistory' },
    { method: 'get', path: '/summary', handler: 'getBattleSummary' },
    { method: 'post', path: '/damage', handler: 'submitDamage' },
  ];

  for (const route of expectedRoutes) {
    const pattern = new RegExp(
      `router\\.${route.method}\\(\\s*['"]${route.path}['"]\\s*,\\s*auth\\s*,\\s*battleController\\.${route.handler}\\s*\\)`
    );
    assert.match(source, pattern, `${route.method.toUpperCase()} ${route.path} should use ${route.handler}`);
  }
});
