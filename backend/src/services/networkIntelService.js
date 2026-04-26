const net = require('net');

const DEFAULT_PROVIDER_URL = String(process.env.IP_INTEL_API_URL || 'https://api.ipapi.is/').trim();
const DEFAULT_TIMEOUT_MS = Math.max(1000, Number(process.env.IP_INTEL_TIMEOUT_MS) || 4000);
const CACHE_TTL_MS = Math.max(10 * 1000, Number(process.env.IP_INTEL_CACHE_TTL_MS) || 6 * 60 * 60 * 1000);
const CACHE_MAX_SIZE = Math.max(100, Number(process.env.IP_INTEL_CACHE_MAX_SIZE) || 5000);

const intelCache = new Map();

function trimText(value) {
  return String(value || '').trim();
}

function normalizeIp(value) {
  const raw = trimText(value);
  if (!raw) return '';
  if (raw.startsWith('::ffff:')) return raw.slice('::ffff:'.length);
  if (raw === '::1') return '127.0.0.1';
  return raw;
}

function isPrivateIpv4(ip) {
  if (!ip || net.isIP(ip) !== 4) return false;
  const parts = ip.split('.').map((item) => Number(item));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  if (parts[0] === 10) return true;
  if (parts[0] === 127) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 169 && parts[1] === 254) return true;
  return false;
}

function isPrivateIpv6(ip) {
  if (!ip || net.isIP(ip) !== 6) return false;
  const normalized = ip.toLowerCase();
  if (normalized === '::1') return true;
  return normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:');
}

function isPrivateIp(ip) {
  return isPrivateIpv4(ip) || isPrivateIpv6(ip);
}

function buildBaseResult(ip) {
  return {
    ip,
    provider: 'local',
    isBogon: false,
    isPrivate: false,
    isTor: false,
    isVpn: false,
    isProxy: false,
    isHosting: false,
    isMobile: false,
    isAnonymous: false,
    riskScore: 0,
    country: '',
    countryCode: '',
    city: '',
    region: '',
    timezone: '',
    company: '',
    asn: '',
    sourceStatus: 'empty',
    raw: null,
  };
}

function scoreIntelFlags({ isTor, isVpn, isProxy, isHosting, isBogon, isPrivate }) {
  if (isBogon) return 100;
  if (isPrivate) return 0;
  let score = 0;
  if (isTor) score = Math.max(score, 95);
  if (isVpn) score = Math.max(score, 82);
  if (isProxy) score = Math.max(score, 72);
  if (isHosting) score = Math.max(score, 45);
  return score;
}

function normalizeExternalResponse(ip, payload = null) {
  const base = buildBaseResult(ip);
  if (!payload || typeof payload !== 'object') {
    return {
      ...base,
      sourceStatus: 'missing',
    };
  }

  const isTor = Boolean(payload.is_tor);
  const isVpn = Boolean(payload.is_vpn);
  const isProxy = Boolean(payload.is_proxy);
  const isHosting = Boolean(payload.is_datacenter);
  const isBogon = Boolean(payload.is_bogon);
  const isPrivate = isPrivateIp(ip);
  const provider = [trimText(payload?.company?.name), trimText(payload?.datacenter?.datacenter)]
    .find(Boolean) || 'ipapi.is';

  return {
    ip,
    provider: provider ? `ipapi.is:${provider}` : 'ipapi.is',
    isBogon,
    isPrivate,
    isTor,
    isVpn,
    isProxy,
    isHosting,
    isMobile: Boolean(payload.is_mobile),
    isAnonymous: Boolean(isTor || isVpn || isProxy || isHosting),
    riskScore: scoreIntelFlags({ isTor, isVpn, isProxy, isHosting, isBogon, isPrivate }),
    country: trimText(payload?.location?.country),
    countryCode: trimText(payload?.location?.country_code),
    city: trimText(payload?.location?.city),
    region: trimText(payload?.location?.state),
    timezone: trimText(payload?.location?.timezone),
    company: trimText(payload?.company?.name || payload?.datacenter?.datacenter),
    asn: trimText(payload?.asn?.asn),
    sourceStatus: 'ok',
    raw: payload,
  };
}

function getCached(ip) {
  const cached = intelCache.get(ip);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    intelCache.delete(ip);
    return null;
  }
  return cached.value;
}

function setCached(ip, value) {
  intelCache.set(ip, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  if (intelCache.size <= CACHE_MAX_SIZE) return;
  const oldest = intelCache.keys().next();
  if (!oldest.done) intelCache.delete(oldest.value);
}

async function fetchExternalIntel(ip) {
  const params = new URLSearchParams({ q: ip });
  const apiKey = trimText(process.env.IP_INTEL_API_KEY);
  if (apiKey) params.set('key', apiKey);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(`${DEFAULT_PROVIDER_URL}?${params.toString()}`, {
      method: 'GET',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response || response.status >= 500) {
    const error = new Error(`ip_intel_http_${response?.status || 'unknown'}`);
    error.status = response?.status || 500;
    throw error;
  }

  const payloadRaw = await response.json().catch(() => null);
  const payload = payloadRaw && typeof payloadRaw === 'object' ? payloadRaw : null;
  if (!payload || payload.error) {
    const error = new Error(trimText(payload?.message || payload?.error || 'ip_intel_invalid_response'));
    error.status = response?.status || 400;
    throw error;
  }

  return normalizeExternalResponse(ip, payload);
}

async function lookupIpIntel(ip) {
  const normalizedIp = normalizeIp(ip);
  const base = buildBaseResult(normalizedIp);
  if (!normalizedIp) {
    return {
      ...base,
      sourceStatus: 'missing_ip',
    };
  }

  if (isPrivateIp(normalizedIp)) {
    return {
      ...base,
      isPrivate: true,
      sourceStatus: 'private',
    };
  }

  if (!net.isIP(normalizedIp)) {
    return {
      ...base,
      sourceStatus: 'invalid_ip',
    };
  }

  const cached = getCached(normalizedIp);
  if (cached) return cached;

  try {
    const intel = await fetchExternalIntel(normalizedIp);
    const enriched = {
      ...intel,
      provider: intel.provider ? `${intel.provider}+local` : 'ipapi.is+local',
    };
    setCached(normalizedIp, enriched);
    return enriched;
  } catch (error) {
    const fallback = {
      ...base,
      sourceStatus: `external_error:${trimText(error?.message || 'unknown')}`,
    };
    setCached(normalizedIp, fallback);
    return fallback;
  }
}

module.exports = {
  normalizeIp,
  lookupIpIntel,
};
