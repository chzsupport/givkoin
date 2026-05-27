const test = require('node:test');
const assert = require('node:assert/strict');

const {
  generateSeedPhrase24,
  SEED_WORDLIST,
} = require('../services/auth/seedPhrase');

test('auth seed phrase generator returns 24 known words', () => {
  const phrase = generateSeedPhrase24();
  const words = phrase.split(' ');
  const knownWords = new Set(SEED_WORDLIST);

  assert.equal(words.length, 24);
  assert.equal(SEED_WORDLIST.length > 100, true);
  assert.equal(words.every((word) => knownWords.has(word)), true);
});
