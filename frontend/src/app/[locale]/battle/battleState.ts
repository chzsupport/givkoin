export type PersonalWeakZone = {
  active: boolean;
  center: { x: number; y: number; z: number } | null;
  radius: number;
};

export type PersonalVoiceCommand = {
  id: string;
  text: 'СТРЕЛЯЙ' | 'СТОЙ';
  endsAt: number;
  requireShot: boolean;
  durationMs: number;
} | null;

const ENEMY_PLANE_Z = -260;
const ENEMY_BOUNDS = {
  minX: -368.32,
  maxX: 368.32,
  minY: -207.18,
  maxY: 207.18,
};

const WEAK_ZONE_X_SEGMENTS = [-160, -110, -60, -10, 40, 90, 160];
const WEAK_ZONE_Y_SEGMENTS = [-60, -10, 40, 90, 140, 180];
const WEAK_ZONE_EXCLUDED_BASE_CELLS = new Set([12, 14]);
const WEAK_ZONE_SUBDIVISIONS = 3;
const WEAK_ZONE_EXCLUDED_ORDINALS = new Set([
  61, 62, 63, 58, 59, 55, 54, 53, 24, 21, 7, 4, 1, 115, 80, 81, 78, 75, 27, 90,
]);

const VOICE_COMMAND_DELAY_MIN_MS = 15000;
const VOICE_COMMAND_DELAY_MAX_MS = 45000;
const VOICE_COMMAND_DURATION_MIN_MS = 10000;
const VOICE_COMMAND_DURATION_MAX_MS = 15000;
const WEAK_ZONE_DELAY_MIN_MS = 15000;
const WEAK_ZONE_DELAY_MAX_MS = 45000;
const WEAK_ZONE_DURATION_MIN_MS = 10000;
const WEAK_ZONE_DURATION_MAX_MS = 15000;
const WEAK_ZONE_RADIUS = 55;

const WEAK_ZONE_CELLS = (() => {
  const rows = WEAK_ZONE_Y_SEGMENTS.length - 1;
  const cols = WEAK_ZONE_X_SEGMENTS.length - 1;
  const cells: Array<{ minX: number; maxX: number; minY: number; maxY: number }> = [];

  for (let baseRow = 0; baseRow < rows; baseRow += 1) {
    for (let baseCol = 0; baseCol < cols; baseCol += 1) {
      const baseIndexZero = baseRow * cols + baseCol;
      if (WEAK_ZONE_EXCLUDED_BASE_CELLS.has(baseIndexZero)) continue;

      const baseMinX = WEAK_ZONE_X_SEGMENTS[baseCol];
      const baseMaxX = WEAK_ZONE_X_SEGMENTS[baseCol + 1];
      const baseMinY = WEAK_ZONE_Y_SEGMENTS[baseRow];
      const baseMaxY = WEAK_ZONE_Y_SEGMENTS[baseRow + 1];

      for (let subRow = 0; subRow < WEAK_ZONE_SUBDIVISIONS; subRow += 1) {
        for (let subCol = 0; subCol < WEAK_ZONE_SUBDIVISIONS; subCol += 1) {
          const minX = baseMinX + ((baseMaxX - baseMinX) * subCol) / WEAK_ZONE_SUBDIVISIONS;
          const maxX = baseMinX + ((baseMaxX - baseMinX) * (subCol + 1)) / WEAK_ZONE_SUBDIVISIONS;
          const minY = baseMinY + ((baseMaxY - baseMinY) * subRow) / WEAK_ZONE_SUBDIVISIONS;
          const maxY = baseMinY + ((baseMaxY - baseMinY) * (subRow + 1)) / WEAK_ZONE_SUBDIVISIONS;
          const subIndex = subRow * WEAK_ZONE_SUBDIVISIONS + subCol + 1;
          const ordinal = baseIndexZero * (WEAK_ZONE_SUBDIVISIONS * WEAK_ZONE_SUBDIVISIONS) + subIndex;
          if (WEAK_ZONE_EXCLUDED_ORDINALS.has(ordinal)) continue;
          cells.push({ minX, maxX, minY, maxY });
        }
      }
    }
  }

  return cells;
})();

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function hashStringToInt(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildBattleStateSeed(
  battleId: string | null | undefined,
  userId: string | null | undefined,
  scope: string,
  bucketIndex: number,
) {
  const safeBattleId = battleId || 'battle';
  const safeUserId = userId || 'global';
  return `${safeBattleId}:${safeUserId}:${scope}:${bucketIndex}`;
}

type StateParams = {
  battleId: string | null | undefined;
  userId: string | null | undefined;
  battleStartsAtMs: number | null;
  atMs: number;
};

export function getPersonalWeakZoneState({
  battleId,
  userId,
  battleStartsAtMs,
  atMs,
}: StateParams): PersonalWeakZone {
  const startedAt = Number(battleStartsAtMs);
  if (!Number.isFinite(startedAt)) {
    return { active: false, center: null, radius: WEAK_ZONE_RADIUS };
  }

  const maxZones = Math.max(1, Math.ceil(Math.max(0, atMs - startedAt) / WEAK_ZONE_DELAY_MIN_MS) + 2);
  for (let zoneIndex = 0; zoneIndex < maxZones; zoneIndex += 1) {
    const zone = getWeakZoneForIndex({ battleId, userId, battleStartsAtMs: startedAt, zoneIndex });
    if (!zone) break;
    if (atMs < zone.startAt) {
      return { active: false, center: null, radius: WEAK_ZONE_RADIUS };
    }
    if (atMs >= zone.startAt && atMs < zone.endsAt) {
      return {
        active: true,
        center: zone.center,
        radius: zone.radius,
      };
    }
  }

  return { active: false, center: null, radius: WEAK_ZONE_RADIUS };
}

function getWeakZoneForIndex({
  battleId,
  userId,
  battleStartsAtMs,
  zoneIndex,
}: {
  battleId: string | null | undefined;
  userId: string | null | undefined;
  battleStartsAtMs: number;
  zoneIndex: number;
}) {
  if (!Number.isFinite(battleStartsAtMs) || zoneIndex < 0) return null;

  let cursorMs = battleStartsAtMs;
  for (let index = 0; index <= zoneIndex; index += 1) {
    const rand = mulberry32(hashStringToInt(buildBattleStateSeed(battleId, userId, 'weak-zone', index)));
    const delayMs = WEAK_ZONE_DELAY_MIN_MS
      + Math.floor(rand() * (WEAK_ZONE_DELAY_MAX_MS - WEAK_ZONE_DELAY_MIN_MS + 1));
    const durationMs = WEAK_ZONE_DURATION_MIN_MS
      + Math.floor(rand() * (WEAK_ZONE_DURATION_MAX_MS - WEAK_ZONE_DURATION_MIN_MS + 1));
    const startAt = cursorMs + delayMs;
    const endsAt = startAt + durationMs;

    if (index === zoneIndex) {
      const cell = WEAK_ZONE_CELLS.length
        ? WEAK_ZONE_CELLS[Math.min(WEAK_ZONE_CELLS.length - 1, Math.floor(rand() * WEAK_ZONE_CELLS.length))]
        : ENEMY_BOUNDS;
      const x = cell.minX + rand() * (cell.maxX - cell.minX);
      const y = cell.minY + rand() * (cell.maxY - cell.minY);
      return {
        startAt,
        endsAt,
        radius: WEAK_ZONE_RADIUS,
        center: {
          x: clamp(x, ENEMY_BOUNDS.minX, ENEMY_BOUNDS.maxX),
          y: clamp(y, ENEMY_BOUNDS.minY, ENEMY_BOUNDS.maxY),
          z: ENEMY_PLANE_Z,
        },
      };
    }

    cursorMs = endsAt;
  }

  return null;
}

function getVoiceCommandForBucket({
  battleId,
  userId,
  battleStartsAtMs,
  bucketIndex,
}: {
  battleId: string | null | undefined;
  userId: string | null | undefined;
  battleStartsAtMs: number;
  bucketIndex: number;
}) {
  if (bucketIndex < 0) return null;

  let cursorMs = battleStartsAtMs;
  for (let index = 0; index <= bucketIndex; index += 1) {
    const rand = mulberry32(hashStringToInt(buildBattleStateSeed(battleId, userId, 'voice', index)));
    const delayMs = VOICE_COMMAND_DELAY_MIN_MS
      + Math.floor(rand() * (VOICE_COMMAND_DELAY_MAX_MS - VOICE_COMMAND_DELAY_MIN_MS + 1));
    const durationMs =
      VOICE_COMMAND_DURATION_MIN_MS
      + Math.floor(rand() * (VOICE_COMMAND_DURATION_MAX_MS - VOICE_COMMAND_DURATION_MIN_MS + 1));
    const startAt = cursorMs + delayMs;
    const endsAt = startAt + durationMs;

    if (index === bucketIndex) {
      const roll = rand() > 0.5;
      const text: 'СТРЕЛЯЙ' | 'СТОЙ' = roll ? 'СТРЕЛЯЙ' : 'СТОЙ';
      const requireShot = text === 'СТОЙ';
      return {
        id: String(bucketIndex),
        text,
        requireShot,
        startAt,
        endsAt,
        durationMs,
      };
    }

    cursorMs = endsAt;
  }

  return null;
}

export function getPersonalVoiceCommandState({
  battleId,
  userId,
  battleStartsAtMs,
  atMs,
}: StateParams): PersonalVoiceCommand {
  const startedAt = Number(battleStartsAtMs);
  if (!Number.isFinite(startedAt)) return null;

  const maxCommands = Math.max(1, Math.ceil(Math.max(0, atMs - startedAt) / VOICE_COMMAND_DELAY_MIN_MS) + 2);
  for (let bucketIndex = 0; bucketIndex < maxCommands; bucketIndex += 1) {
    const command = getVoiceCommandForBucket({
      battleId,
      userId,
      battleStartsAtMs: startedAt,
      bucketIndex,
    });
    if (!command) break;
    if (atMs < command.startAt) return null;
    if (atMs >= command.startAt && atMs < command.endsAt) {
      return {
        id: command.id,
        text: command.text,
        endsAt: command.endsAt,
        requireShot: command.requireShot,
        durationMs: command.durationMs,
      };
    }
  }

  return null;
}
