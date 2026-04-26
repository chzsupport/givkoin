export type NewsMediaKind = 'image' | 'video' | 'embed' | 'link';

export type NewsMediaInfo = {
  kind: NewsMediaKind;
  url: string;
  embedUrl?: string;
  provider?: string;
  providerLabel: string;
  hostLabel: string;
  thumbnailUrl?: string | null;
};

const URL_BASE = 'https://givkoin.local';
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|avif|svg|bmp|ico)$/i;
const VIDEO_EXT_RE = /\.(mp4|webm|ogg|ogv|mov|m4v|m3u8)$/i;

function normalizeHost(hostname: string) {
  return String(hostname || '').trim().toLowerCase().replace(/^www\./, '');
}

function getSafeUrl(rawValue: string) {
  try {
    return new URL(rawValue, URL_BASE);
  } catch {
    return null;
  }
}

function getDecodedPathname(url: URL) {
  try {
    return decodeURIComponent(url.pathname || '');
  } catch {
    return url.pathname || '';
  }
}

function buildHostLabel(url: URL) {
  const host = normalizeHost(url.hostname);
  if (!host || host === 'givkoin.local') return 'GIVKOIN';
  return host;
}

function getYoutubeId(url: URL) {
  const host = normalizeHost(url.hostname);
  const path = getDecodedPathname(url);
  if (host === 'youtu.be') {
    return path.split('/').filter(Boolean)[0] || '';
  }
  if (!host.includes('youtube.com') && !host.includes('youtube-nocookie.com')) {
    return '';
  }
  if (path.startsWith('/watch')) {
    return String(url.searchParams.get('v') || '').trim();
  }
  const parts = path.split('/').filter(Boolean);
  const markerIndex = parts.findIndex((part) => ['embed', 'shorts', 'live'].includes(part));
  if (markerIndex >= 0) {
    return String(parts[markerIndex + 1] || '').trim();
  }
  return '';
}

function getVimeoId(url: URL) {
  const host = normalizeHost(url.hostname);
  if (!host.includes('vimeo.com')) return '';
  const parts = getDecodedPathname(url).split('/').filter(Boolean);
  const digitBlock = parts.find((part) => /^\d+$/.test(part));
  return digitBlock || '';
}

function getRutubeId(url: URL) {
  const host = normalizeHost(url.hostname);
  if (!host.includes('rutube.ru')) return '';
  const parts = getDecodedPathname(url).split('/').filter(Boolean);
  const videoIndex = parts.findIndex((part) => part === 'video');
  if (videoIndex >= 0) {
    return String(parts[videoIndex + 1] || '').trim();
  }
  const embedIndex = parts.findIndex((part) => part === 'embed');
  if (embedIndex >= 0) {
    return String(parts[embedIndex + 1] || '').trim();
  }
  return '';
}

function getDailymotionId(url: URL) {
  const host = normalizeHost(url.hostname);
  const parts = getDecodedPathname(url).split('/').filter(Boolean);
  if (host === 'dai.ly') {
    return String(parts[0] || '').trim();
  }
  if (!host.includes('dailymotion.com')) return '';
  const videoIndex = parts.findIndex((part) => part === 'video');
  if (videoIndex >= 0) {
    return String(parts[videoIndex + 1] || '').trim();
  }
  return '';
}

function getGoogleDriveId(url: URL) {
  const host = normalizeHost(url.hostname);
  if (host !== 'drive.google.com') return '';
  const parts = getDecodedPathname(url).split('/').filter(Boolean);
  const fileIndex = parts.findIndex((part) => part === 'd');
  if (fileIndex >= 0) {
    return String(parts[fileIndex + 1] || '').trim();
  }
  return String(url.searchParams.get('id') || '').trim();
}

function getEmbedInfo(url: URL): Omit<NewsMediaInfo, 'kind' | 'url' | 'hostLabel'> | null {
  const youtubeId = getYoutubeId(url);
  if (youtubeId) {
    return {
      embedUrl: `https://www.youtube.com/embed/${youtubeId}`,
      provider: 'youtube',
      providerLabel: 'YouTube',
      thumbnailUrl: `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`,
    };
  }

  const vimeoId = getVimeoId(url);
  if (vimeoId) {
    return {
      embedUrl: `https://player.vimeo.com/video/${vimeoId}`,
      provider: 'vimeo',
      providerLabel: 'Vimeo',
      thumbnailUrl: null,
    };
  }

  const rutubeId = getRutubeId(url);
  if (rutubeId) {
    return {
      embedUrl: `https://rutube.ru/play/embed/${rutubeId}`,
      provider: 'rutube',
      providerLabel: 'RuTube',
      thumbnailUrl: null,
    };
  }

  const dailymotionId = getDailymotionId(url);
  if (dailymotionId) {
    return {
      embedUrl: `https://www.dailymotion.com/embed/video/${dailymotionId}`,
      provider: 'dailymotion',
      providerLabel: 'Dailymotion',
      thumbnailUrl: `https://www.dailymotion.com/thumbnail/video/${dailymotionId}`,
    };
  }

  const driveId = getGoogleDriveId(url);
  if (driveId) {
    return {
      embedUrl: `https://drive.google.com/file/d/${driveId}/preview`,
      provider: 'google-drive',
      providerLabel: 'Google Drive',
      thumbnailUrl: null,
    };
  }

  return null;
}

export function describeNewsMedia(rawValue?: string | null): NewsMediaInfo | null {
  const value = String(rawValue || '').trim();
  if (!value) return null;

  const parsedUrl = getSafeUrl(value);
  if (!parsedUrl) {
    return {
      kind: 'link',
      url: value,
      providerLabel: 'Ссылка',
      hostLabel: 'Внешняя ссылка',
    };
  }

  const pathname = getDecodedPathname(parsedUrl).toLowerCase();
  const hostLabel = buildHostLabel(parsedUrl);

  if (IMAGE_EXT_RE.test(pathname)) {
    return {
      kind: 'image',
      url: value,
      providerLabel: 'Изображение',
      hostLabel,
    };
  }

  if (VIDEO_EXT_RE.test(pathname)) {
    return {
      kind: 'video',
      url: value,
      providerLabel: 'Видео',
      hostLabel,
    };
  }

  const embedInfo = getEmbedInfo(parsedUrl);
  if (embedInfo?.embedUrl) {
    return {
      kind: 'embed',
      url: value,
      hostLabel,
      ...embedInfo,
    };
  }

  return {
    kind: 'link',
    url: value,
    providerLabel: 'Ссылка',
    hostLabel,
  };
}

