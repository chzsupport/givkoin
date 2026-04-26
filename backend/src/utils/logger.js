const LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const currentLevelName = String(process.env.LOG_LEVEL || 'info').toLowerCase();
const currentLevel = Object.prototype.hasOwnProperty.call(LEVELS, currentLevelName)
  ? LEVELS[currentLevelName]
  : LEVELS.info;

function shouldLog(level) {
  return LEVELS[level] <= currentLevel;
}

function serializeMeta(meta) {
  if (meta == null) return '';
  if (meta instanceof Error) {
    return JSON.stringify({
      message: meta.message,
      stack: meta.stack,
      name: meta.name,
    });
  }
  try {
    return JSON.stringify(meta);
  } catch {
    return String(meta);
  }
}

function write(level, message, meta) {
  if (!shouldLog(level)) return;
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level.toUpperCase()}] ${message}`;
  const tail = serializeMeta(meta);
  if (level === 'error') {
    console.error(tail ? `${line} ${tail}` : line);
    return;
  }
  if (level === 'warn') {
    console.warn(tail ? `${line} ${tail}` : line);
    return;
  }
  console.log(tail ? `${line} ${tail}` : line);
}

module.exports = {
  error: (message, meta) => write('error', message, meta),
  warn: (message, meta) => write('warn', message, meta),
  info: (message, meta) => write('info', message, meta),
  debug: (message, meta) => write('debug', message, meta),
};
