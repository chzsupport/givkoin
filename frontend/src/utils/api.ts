import { getSiteLanguage } from '@/i18n/siteLanguage';
import ruDict from '../../messages/ru.json';
import enDict from '../../messages/en.json';

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === 'development'
    ? 'http://localhost:3001'
    : 'https://your-backend-service.onrender.com');
export const BACKEND_STATUS_EVENT = 'givkoin:backend-status';

const DEFAULT_TIMEOUT_MS = 120000;
type ApiRequestOptions = {
  timeoutMs?: number;
};

function localizeMessage(message: string) {
  return String(message || '');
}

function resolveNestedValue(dict: Record<string, unknown>, dottedKey: string): string | undefined {
  const parts = dottedKey.split('.');
  let current: unknown = dict;
  for (const part of parts) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === 'string' ? current : undefined;
}

function tSystem(dottedKey: string) {
  const dict = getSiteLanguage() === 'en' ? (enDict as unknown as Record<string, unknown>) : (ruDict as unknown as Record<string, unknown>);
  return resolveNestedValue(dict, dottedKey) || dottedKey;
}

function emitBackendStatus(available: boolean, reason = '') {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(BACKEND_STATUS_EVENT, {
    detail: {
      available,
      reason,
      at: Date.now(),
    },
  }));
}

function getOrCreateLocalId(key: string): string {
  if (typeof window === 'undefined') return '';
  try {
    const existing = window.localStorage.getItem(key);
    if (existing) return existing;
    const created = typeof window.crypto?.randomUUID === 'function'
      ? window.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    window.localStorage.setItem(key, created);
    return created;
  } catch {
    return '';
  }
}

let cachedIdentityPromise: Promise<Record<string, string>> | null = null;

function collectCanvasFingerprint(): string {
  if (typeof window === 'undefined') return '';
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 220;
    canvas.height = 40;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.textBaseline = 'top';
    ctx.font = '16px sans-serif';
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 220, 40);
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('GIVKOIN-FP-v2', 8, 10);
    return canvas.toDataURL();
  } catch {
    return '';
  }
}

function collectWebGlFingerprint(): string {
  if (typeof window === 'undefined') return '';
  try {
    const canvas = document.createElement('canvas');
    const gl =
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl');
    if (!gl) return '';
    const safeGl = gl as WebGLRenderingContext;
    const debugInfo = safeGl.getExtension('WEBGL_debug_renderer_info');
    const vendor = debugInfo
      ? safeGl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
      : safeGl.getParameter(safeGl.VENDOR);
    const renderer = debugInfo
      ? safeGl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
      : safeGl.getParameter(safeGl.RENDERER);
    const version = safeGl.getParameter(safeGl.VERSION);
    const shading = safeGl.getParameter(safeGl.SHADING_LANGUAGE_VERSION);
    return [vendor, renderer, version, shading]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .join('|');
  } catch {
    return '';
  }
}

function fallbackHash(input: string): string {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) - hash + input.charCodeAt(index)) | 0;
  }
  return `fh_${Math.abs(hash).toString(16)}`;
}

function base64UrlEncode(input: string): string {
  if (typeof window === 'undefined') return '';
  try {
    const bytes = new TextEncoder().encode(input);
    let binary = '';
    bytes.forEach((value) => {
      binary += String.fromCharCode(value);
    });
    return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  } catch {
    return '';
  }
}

function detectBrowserAutomation(nav: Navigator, userAgent: string): { webdriver: boolean; headless: boolean } {
  const safeUserAgent = String(userAgent || '').toLowerCase();
  const webdriver = Boolean((nav as Navigator & { webdriver?: boolean }).webdriver);
  const headless = webdriver
    || safeUserAgent.includes('headless')
    || safeUserAgent.includes('phantomjs')
    || safeUserAgent.includes('playwright')
    || safeUserAgent.includes('puppeteer');
  return { webdriver, headless };
}

function detectEmulator(options: {
  platform: string;
  userAgent: string;
  webglFingerprint: string;
  maxTouchPoints: number;
}) {
  const platform = String(options.platform || '').toLowerCase();
  const userAgent = String(options.userAgent || '').toLowerCase();
  const webgl = String(options.webglFingerprint || '').toLowerCase();
  const markers = [
    'bluestacks',
    'nox',
    'ldplayer',
    'genymotion',
    'android sdk built for x86',
    'sdk_gphone',
    'sdk_phone',
    'emulator',
    'virtualbox',
    'vbox',
    'goldfish',
    'ranchu',
    'swiftshader',
    'angle (google',
    'microsoft basic render',
    'llvmpipe',
  ];
  const hasMarker = markers.some((marker) => userAgent.includes(marker) || webgl.includes(marker));
  const androidDesktopShape = userAgent.includes('android')
    && (
      platform.includes('linux x86')
      || platform.includes('win')
      || platform.includes('mac')
      || (options.maxTouchPoints === 0 && webgl.includes('swiftshader'))
    );
  return hasMarker || androidDesktopShape;
}

async function hashText(input: string): Promise<string> {
  if (typeof window === 'undefined') return '';
  try {
    const bytes = new TextEncoder().encode(input);
    const digest = await window.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return fallbackHash(input);
  }
}

async function getClientIdentityHeaders(): Promise<Record<string, string>> {
  if (typeof window === 'undefined') return {};
  if (cachedIdentityPromise) return cachedIdentityPromise;

  cachedIdentityPromise = (async () => {
    const deviceId = getOrCreateLocalId('givkoin_device_id');
    const nav = window.navigator;
    const screenInfo = window.screen;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    const canvasFingerprint = collectCanvasFingerprint();
    const webglFingerprint = collectWebGlFingerprint();
    const [webglVendor = '', webglRenderer = ''] = webglFingerprint.split('|');
    const prefersReducedMotion = typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;
    const coarsePointer = typeof window.matchMedia === 'function'
      ? window.matchMedia('(pointer: coarse)').matches
      : false;
    const automation = detectBrowserAutomation(nav, nav.userAgent || '');
    const emulator = detectEmulator({
      platform: nav.platform || '',
      userAgent: nav.userAgent || '',
      webglFingerprint,
      maxTouchPoints: Number(nav.maxTouchPoints || 0),
    });

    const weakBasis = [
      nav.platform,
      nav.language,
      nav.languages?.slice().sort().join(',') || '',
      screenInfo?.width,
      screenInfo?.height,
      screenInfo?.availWidth,
      screenInfo?.availHeight,
      screenInfo?.colorDepth,
      screenInfo?.pixelDepth,
      timezone,
      nav.hardwareConcurrency || '',
      (nav as Navigator & { deviceMemory?: number }).deviceMemory || '',
      nav.maxTouchPoints || '',
      coarsePointer ? 'coarse' : 'fine',
      prefersReducedMotion ? 'reduce' : 'normal',
      webglFingerprint,
    ].join('|');

    const strongBasis = [
      weakBasis,
      nav.userAgent,
      nav.languages?.join(',') || '',
      nav.cookieEnabled ? '1' : '0',
      nav.doNotTrack || '',
      nav.vendor || '',
      window.devicePixelRatio || '',
      canvasFingerprint,
    ].join('|');

    const [fingerprint, weakFingerprint] = await Promise.all([
      hashText(`strong:${strongBasis}`),
      hashText(`weak:${weakBasis}`),
    ]);

    const clientProfile = {
      platform: String(nav.platform || '').slice(0, 80),
      vendor: String(nav.vendor || '').slice(0, 80),
      language: String(nav.language || '').slice(0, 20),
      languages: nav.languages?.slice(0, 6) || [],
      timezone: String(timezone || '').slice(0, 80),
      hardwareConcurrency: Number(nav.hardwareConcurrency || 0) || 0,
      deviceMemory: Number((nav as Navigator & { deviceMemory?: number }).deviceMemory || 0) || 0,
      maxTouchPoints: Number(nav.maxTouchPoints || 0) || 0,
      screen: {
        width: Number(screenInfo?.width || 0) || 0,
        height: Number(screenInfo?.height || 0) || 0,
        availWidth: Number(screenInfo?.availWidth || 0) || 0,
        availHeight: Number(screenInfo?.availHeight || 0) || 0,
        colorDepth: Number(screenInfo?.colorDepth || 0) || 0,
        pixelDepth: Number(screenInfo?.pixelDepth || 0) || 0,
        pixelRatio: Number(window.devicePixelRatio || 1) || 1,
      },
      coarsePointer,
      prefersReducedMotion,
      webglVendor: String(webglVendor || '').slice(0, 120),
      webglRenderer: String(webglRenderer || '').slice(0, 180),
      webdriver: automation.webdriver,
      headless: automation.headless,
      emulator,
    };
    const clientProfileKey = await hashText(`profile:${JSON.stringify({
      platform: clientProfile.platform,
      vendor: clientProfile.vendor,
      timezone: clientProfile.timezone,
      hardwareConcurrency: clientProfile.hardwareConcurrency,
      deviceMemory: clientProfile.deviceMemory,
      maxTouchPoints: clientProfile.maxTouchPoints,
      screen: clientProfile.screen,
      coarsePointer: clientProfile.coarsePointer,
      webglVendor: clientProfile.webglVendor,
      webglRenderer: clientProfile.webglRenderer,
      webdriver: clientProfile.webdriver,
      headless: clientProfile.headless,
      emulator: clientProfile.emulator,
    })}`);
    const encodedClientProfile = base64UrlEncode(JSON.stringify(clientProfile));

    const headers: Record<string, string> = {};
    if (deviceId) headers['x-device-id'] = deviceId;
    if (fingerprint) headers['x-client-fingerprint'] = fingerprint;
    if (weakFingerprint) headers['x-client-fingerprint-weak'] = weakFingerprint;
    if (clientProfileKey) headers['x-client-profile-key'] = clientProfileKey;
    if (encodedClientProfile) headers['x-client-profile'] = encodedClientProfile;
    return headers;
  })();

  return cachedIdentityPromise;
}

async function handleResponse<T>(res: Response): Promise<T> {
  const data: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    emitAdBoostOffer(data);
    const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
    const asString = (v: unknown): string => (typeof v === 'string' ? v : '');

    const messageFromObject = () => {
      if (!isObject(data)) return '';
      return asString(data.message) || asString(data.error);
    };

    const messageFromErrors = () => {
      if (!isObject(data)) return '';
      const errors = data.errors;
      if (!Array.isArray(errors)) return '';
      const parts = errors
        .map((e) => {
          if (!isObject(e)) return '';
          return asString(e.msg) || asString(e.message);
        })
        .filter(Boolean);
      return parts.join(', ');
    };

    const message =
      messageFromObject() ||
      messageFromErrors() ||
      tSystem('common.request_error');

    throw new Error(localizeMessage(message));
  }
  emitBackendStatus(true);
  return data as T;
}

function emitAdBoostOffer(data: unknown) {
  if (typeof window === 'undefined') return;
  if (!data || typeof data !== 'object') return;
  const offer = (data as { boostOffer?: unknown }).boostOffer;
  if (!offer || typeof offer !== 'object') return;
  window.dispatchEvent(new CustomEvent('givkoin:ad-boost-offer', { detail: offer }));
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      emitBackendStatus(false, tSystem('server.not_responding'));
    } else {
      emitBackendStatus(false, tSystem('server.no_connection'));
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function apiPost<T>(path: string, body: unknown, options: ApiRequestOptions = {}): Promise<T> {
  const identityHeaders = await getClientIdentityHeaders();
  const res = await fetchWithTimeout(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-site-language': getSiteLanguage(), ...identityHeaders },
    body: JSON.stringify(body),
    credentials: 'include',
  }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const data = await handleResponse<T>(res);
  emitAdBoostOffer(data);
  return data;
}

export async function apiPostKeepalive(path: string, body: unknown, options: ApiRequestOptions = {}): Promise<void> {
  const identityHeaders = await getClientIdentityHeaders();
  await fetchWithTimeout(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-site-language': getSiteLanguage(), ...identityHeaders },
    body: JSON.stringify(body),
    keepalive: true,
    credentials: 'include',
  }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS).catch(() => {});
}

export async function apiGet<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const identityHeaders = await getClientIdentityHeaders();
  const res = await fetchWithTimeout(`${API_URL}${path}`, {
    headers: { 'x-site-language': getSiteLanguage(), ...identityHeaders },
    credentials: 'include',
  }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const data = await handleResponse<T>(res);
  emitAdBoostOffer(data);
  return data;
}

export async function apiPatch<T>(path: string, body: unknown, options: ApiRequestOptions = {}): Promise<T> {
  const identityHeaders = await getClientIdentityHeaders();
  const res = await fetchWithTimeout(`${API_URL}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'x-site-language': getSiteLanguage(), ...identityHeaders },
    body: JSON.stringify(body),
    credentials: 'include',
  }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const data = await handleResponse<T>(res);
  emitAdBoostOffer(data);
  return data;
}

export async function apiPut<T>(path: string, body: unknown, options: ApiRequestOptions = {}): Promise<T> {
  const identityHeaders = await getClientIdentityHeaders();
  const res = await fetchWithTimeout(`${API_URL}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-site-language': getSiteLanguage(), ...identityHeaders },
    body: JSON.stringify(body),
    credentials: 'include',
  }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const data = await handleResponse<T>(res);
  emitAdBoostOffer(data);
  return data;
}

export async function apiDelete<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const identityHeaders = await getClientIdentityHeaders();
  const res = await fetchWithTimeout(`${API_URL}${path}`, {
    method: 'DELETE',
    headers: { 'x-site-language': getSiteLanguage(), ...identityHeaders },
    credentials: 'include',
  }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const data = await handleResponse<T>(res);
  emitAdBoostOffer(data);
  return data;
}

