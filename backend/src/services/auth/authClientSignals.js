const crypto = require('crypto');

const {
  buildSignals: defaultBuildSignals,
  lookupIpIntel: defaultLookupIpIntel,
} = require('../multiAccountService');

function normalizeClientProfile(value) {
  return value && typeof value === 'object' ? value : null;
}

function createUserAgentFingerprint(req) {
  return crypto.createHash('sha256').update(req?.headers?.['user-agent'] || '').digest('hex');
}

function createAuthClientSignals({
  buildSignals = defaultBuildSignals,
  lookupIpIntel = defaultLookupIpIntel,
  fallbackFingerprint = createUserAgentFingerprint,
} = {}) {
  async function buildRegistrationSignalContext({ client = {}, req, email }) {
    const ip = client.ip || '';
    const deviceId = client.deviceId || '';
    const fingerprint = client.fingerprint || fallbackFingerprint(req);
    const weakFingerprint = client.weakFingerprint || '';
    const ipIntel = await lookupIpIntel(ip);
    const clientProfile = normalizeClientProfile(client.clientProfile);
    const profileKey = client.profileKey || '';
    const signals = buildSignals({
      ip,
      deviceId,
      fingerprint,
      weakFingerprint,
      profileKey,
      clientProfile,
      email,
      userAgent: client.userAgent,
      ipIntel,
    });

    return {
      clientProfile,
      deviceId,
      fingerprint,
      ip,
      ipIntel,
      profileKey,
      signals,
      weakFingerprint,
    };
  }

  async function buildLoginSignalContext({ client = {}, email }) {
    const ipIntel = await lookupIpIntel(client.ip || '');
    const clientProfile = normalizeClientProfile(client.clientProfile);
    const profileKey = client.profileKey || '';
    const signals = buildSignals({
      ip: client.ip,
      deviceId: client.deviceId,
      fingerprint: client.fingerprint,
      weakFingerprint: client.weakFingerprint,
      profileKey,
      clientProfile,
      email,
      userAgent: client.userAgent,
      ipIntel,
    });

    return {
      clientProfile,
      ipIntel,
      profileKey,
      signals,
    };
  }

  return {
    buildLoginSignalContext,
    buildRegistrationSignalContext,
  };
}

module.exports = {
  ...createAuthClientSignals(),
  createAuthClientSignals,
  normalizeClientProfile,
};
