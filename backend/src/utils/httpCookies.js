function parseCookieHeader(rawCookie) {
  const result = {};
  const cookieHeader = String(rawCookie || '').trim();
  if (!cookieHeader) return result;

  for (const chunk of cookieHeader.split(';')) {
    const safeChunk = String(chunk || '').trim();
    if (!safeChunk) continue;
    const eqIndex = safeChunk.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = safeChunk.slice(0, eqIndex).trim();
    const value = safeChunk.slice(eqIndex + 1).trim();
    if (!key) continue;
    try {
      result[key] = decodeURIComponent(value);
    } catch (_error) {
      result[key] = value;
    }
  }

  return result;
}

module.exports = {
  parseCookieHeader,
};
