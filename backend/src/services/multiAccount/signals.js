function cleanText(value) {
  return String(value || '').trim();
}

function normalizeSignalValue(value) {
  return cleanText(value).toLowerCase();
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round(value, digits = 3) {
  const n = safeNumber(value);
  const power = 10 ** digits;
  return Math.round(n * power) / power;
}

function toPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function uniq(values = []) {
  return Array.from(new Set((Array.isArray(values) ? values : []).filter(Boolean)));
}

function normalizeEmailForAntiFarm(email) {
  const e = normalizeSignalValue(email);
  const at = e.indexOf('@');
  if (at <= 0) return '';

  let local = e.slice(0, at);
  const domain = e.slice(at + 1);
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    const plus = local.indexOf('+');
    if (plus > 0) local = local.slice(0, plus);
    local = local.replace(/\./g, '');
  }
  return `${local}@${domain}`;
}

function normalizeClientProfile(raw = null) {
  const value = toPlainObject(raw);
  const screen = toPlainObject(value.screen);
  return {
    platform: cleanText(value.platform).slice(0, 80),
    vendor: cleanText(value.vendor).slice(0, 80),
    language: cleanText(value.language).slice(0, 20),
    languages: uniq((Array.isArray(value.languages) ? value.languages : []).map((item) => cleanText(item).slice(0, 20))).slice(0, 6),
    timezone: cleanText(value.timezone).slice(0, 80),
    hardwareConcurrency: Math.max(0, Math.floor(safeNumber(value.hardwareConcurrency))),
    deviceMemory: Math.max(0, safeNumber(value.deviceMemory)),
    maxTouchPoints: Math.max(0, Math.floor(safeNumber(value.maxTouchPoints))),
    screen: {
      width: Math.max(0, Math.floor(safeNumber(screen.width))),
      height: Math.max(0, Math.floor(safeNumber(screen.height))),
      availWidth: Math.max(0, Math.floor(safeNumber(screen.availWidth))),
      availHeight: Math.max(0, Math.floor(safeNumber(screen.availHeight))),
      colorDepth: Math.max(0, Math.floor(safeNumber(screen.colorDepth))),
      pixelDepth: Math.max(0, Math.floor(safeNumber(screen.pixelDepth))),
      pixelRatio: round(Math.max(0, safeNumber(screen.pixelRatio || 1)), 3),
    },
    coarsePointer: Boolean(value.coarsePointer),
    prefersReducedMotion: Boolean(value.prefersReducedMotion),
    webglVendor: cleanText(value.webglVendor).slice(0, 120),
    webglRenderer: cleanText(value.webglRenderer).slice(0, 200),
    webdriver: Boolean(value.webdriver),
    headless: Boolean(value.headless),
    emulator: Boolean(value.emulator),
  };
}

function buildSignals(input = {}) {
  const ipIntel = input.ipIntel && typeof input.ipIntel === 'object' ? input.ipIntel : null;
  const clientProfile = normalizeClientProfile(input.clientProfile);
  return {
    ip: normalizeSignalValue(input.ip),
    deviceId: normalizeSignalValue(input.deviceId || input.device),
    fingerprint: normalizeSignalValue(input.fingerprint),
    weakFingerprint: normalizeSignalValue(input.weakFingerprint),
    profileKey: normalizeSignalValue(input.profileKey),
    emailRaw: cleanText(input.email),
    emailNormalized: normalizeEmailForAntiFarm(input.emailNormalized || input.email),
    userAgent: cleanText(input.userAgent),
    clientProfile,
    ipIntel,
  };
}

module.exports = {
  buildSignals,
  normalizeClientProfile,
  normalizeEmailForAntiFarm,
  normalizeSignalValue,
};
