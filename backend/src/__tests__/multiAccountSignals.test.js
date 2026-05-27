const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildSignals,
  normalizeClientProfile,
  normalizeEmailForAntiFarm,
  normalizeSignalValue,
} = require('../services/multiAccount/signals');

test('multi-account signals normalize email aliases without changing non-gmail local parts', () => {
  assert.equal(normalizeEmailForAntiFarm(' User.Name+promo@Gmail.com '), 'username@gmail.com');
  assert.equal(normalizeEmailForAntiFarm(' User.Name+promo@yandex.ru '), 'user.name+promo@yandex.ru');
  assert.equal(normalizeEmailForAntiFarm('not-an-email'), '');
});

test('multi-account signals keep public signal shape stable', () => {
  const ipIntel = { isVpn: true };
  const signals = buildSignals({
    ip: ' 192.168.0.1 ',
    device: ' Device-A ',
    fingerprint: ' Finger-A ',
    weakFingerprint: ' Weak-A ',
    profileKey: ' Profile-A ',
    email: 'User.Name+promo@gmail.com',
    userAgent: ' Browser/1 ',
    ipIntel,
  });

  assert.equal(signals.ip, '192.168.0.1');
  assert.equal(signals.deviceId, 'device-a');
  assert.equal(signals.fingerprint, 'finger-a');
  assert.equal(signals.weakFingerprint, 'weak-a');
  assert.equal(signals.profileKey, 'profile-a');
  assert.equal(signals.emailRaw, 'User.Name+promo@gmail.com');
  assert.equal(signals.emailNormalized, 'username@gmail.com');
  assert.equal(signals.userAgent, 'Browser/1');
  assert.equal(signals.ipIntel, ipIntel);
});

test('multi-account client profile normalization clamps values and deduplicates languages', () => {
  const profile = normalizeClientProfile({
    platform: 'Windows'.repeat(20),
    vendor: 'Vendor',
    language: 'ru-RU-extra-long-value',
    languages: ['ru-RU', 'en-US', 'ru-RU', 'kk-KZ', 'de-DE', 'fr-FR', 'es-ES', 'it-IT'],
    timezone: 'Asia/Qyzylorda',
    hardwareConcurrency: -4,
    deviceMemory: 16.5,
    maxTouchPoints: 3.9,
    screen: {
      width: 1920.9,
      height: 1080.8,
      availWidth: -1,
      availHeight: 1000.2,
      colorDepth: 24,
      pixelDepth: 24,
      pixelRatio: 1.23456,
    },
    coarsePointer: 1,
    prefersReducedMotion: 0,
    webglVendor: 'WebGL Vendor',
    webglRenderer: 'WebGL Renderer',
    webdriver: true,
    headless: false,
    emulator: true,
  });

  assert.equal(profile.platform.length, 80);
  assert.equal(profile.language, 'ru-RU-extra-long-val');
  assert.deepEqual(profile.languages, ['ru-RU', 'en-US', 'kk-KZ', 'de-DE', 'fr-FR', 'es-ES']);
  assert.equal(profile.hardwareConcurrency, 0);
  assert.equal(profile.deviceMemory, 16.5);
  assert.equal(profile.maxTouchPoints, 3);
  assert.equal(profile.screen.width, 1920);
  assert.equal(profile.screen.height, 1080);
  assert.equal(profile.screen.availWidth, 0);
  assert.equal(profile.screen.pixelRatio, 1.235);
  assert.equal(profile.coarsePointer, true);
  assert.equal(profile.prefersReducedMotion, false);
  assert.equal(profile.webdriver, true);
  assert.equal(profile.emulator, true);
});

test('multi-account signal value normalization trims and lowercases', () => {
  assert.equal(normalizeSignalValue(' Device-ID '), 'device-id');
});
