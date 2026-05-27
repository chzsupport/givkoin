const { toIso } = require('../documentStore');

const SHIFT_START_HOUR = 19;
const SHIFT_END_HOUR = 6;

function pad2(value) {
  return String(Math.max(0, Number(value) || 0)).padStart(2, '0');
}

function formatShiftKey(value) {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function parseShiftKey(key) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || '').trim());
  if (!match) return null;
  const parsed = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function getPreviousShiftKey(currentShiftKey) {
  const currentDate = parseShiftKey(currentShiftKey);
  if (!currentDate) return '';
  currentDate.setDate(currentDate.getDate() - 1);
  return formatShiftKey(currentDate);
}

function isShiftRestRequired(lastJoinedShiftKey, currentShiftKey) {
  const lastKey = String(lastJoinedShiftKey || '').trim();
  const currentKey = String(currentShiftKey || '').trim();
  if (!lastKey || !currentKey) return false;
  return lastKey === getPreviousShiftKey(currentKey);
}

function getShiftWindow(now = new Date()) {
  const base = now instanceof Date ? new Date(now) : new Date(now);
  const hour = base.getHours();

  const start = new Date(base);
  const end = new Date(base);

  if (hour >= SHIFT_START_HOUR) {
    start.setHours(SHIFT_START_HOUR, 0, 0, 0);
    end.setDate(end.getDate() + 1);
    end.setHours(SHIFT_END_HOUR, 0, 0, 0);
    return {
      key: formatShiftKey(start),
      startAt: start,
      endAt: end,
      isOpen: true,
    };
  }

  if (hour < SHIFT_END_HOUR) {
    start.setDate(start.getDate() - 1);
    start.setHours(SHIFT_START_HOUR, 0, 0, 0);
    end.setHours(SHIFT_END_HOUR, 0, 0, 0);
    return {
      key: formatShiftKey(start),
      startAt: start,
      endAt: end,
      isOpen: true,
    };
  }

  start.setHours(SHIFT_START_HOUR, 0, 0, 0);
  end.setDate(end.getDate() + 1);
  end.setHours(SHIFT_END_HOUR, 0, 0, 0);
  return {
    key: formatShiftKey(start),
    startAt: start,
    endAt: end,
    isOpen: false,
  };
}

function getShiftWindowByKey(shiftKey) {
  const shiftDate = parseShiftKey(shiftKey);
  if (!shiftDate) return null;
  const start = new Date(shiftDate);
  start.setHours(SHIFT_START_HOUR, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  end.setHours(SHIFT_END_HOUR, 0, 0, 0);
  return {
    key: formatShiftKey(start),
    startAt: start,
    endAt: end,
    isOpen: false,
  };
}

function getShiftScheduleSnapshot(now = new Date()) {
  const shiftWindow = getShiftWindow(now);
  return {
    isOpen: Boolean(shiftWindow?.isOpen),
    startAt: toIso(shiftWindow?.startAt || now),
    endAt: toIso(shiftWindow?.endAt || now),
  };
}

module.exports = {
  SHIFT_START_HOUR,
  SHIFT_END_HOUR,
  formatShiftKey,
  getPreviousShiftKey,
  getShiftScheduleSnapshot,
  getShiftWindow,
  getShiftWindowByKey,
  isShiftRestRequired,
  parseShiftKey,
};
