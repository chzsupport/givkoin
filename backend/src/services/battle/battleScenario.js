const {
  TICK_SECONDS,
  DARKNESS_DAMAGE_PER_TARGET_USER,
  GUARDIAN_DAMAGE_BEFORE_FIRST_JOIN,
  GUARDIAN_DAMAGE_AFTER_FIRST_JOIN,
  BATTLE_BASE_DURATION_SECONDS,
  BATTLE_NO_ENTRY_DURATION_SECONDS,
} = require('./battleConfig');

const ENEMY_PLANE_Z = -260;
const ENEMY_BOUNDS = {
  minX: -368.32,
  maxX: 368.32,
  minY: -207.18,
  maxY: 207.18,
};
const ENEMY_OUTLINE_WIDTH = ENEMY_BOUNDS.maxX - ENEMY_BOUNDS.minX;
const ENEMY_OUTLINE_HEIGHT = ENEMY_BOUNDS.maxY - ENEMY_BOUNDS.minY;

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
const SPARK_DELAY_MIN_MS = 15000;
const SPARK_DELAY_MAX_MS = 60000;
const SPARK_REWARD_LUMENS = 100;
const SPARK_BASE_SPEED = 0.0102;
const BADDIE_DELAY_MIN_MS = 15000;
const BADDIE_DELAY_MAX_MS = 30000;
const BADDIE_SIZE_RANGE = [0.045, 0.09];
const BADDIE_DAMAGE_INTERVAL_MS = 1000;
const BADDIE_COLORS = ['#2a0404', '#3a0707', '#4b0c0c', '#5b0b12', '#2b0a12'];
const BADDIE_SHAPES = ['spike', 'crystal'];
const BATTLE_SCENARIO_VERSION = 3;

const WEAK_ZONE_CELLS = (() => {
  const rows = WEAK_ZONE_Y_SEGMENTS.length - 1;
  const cols = WEAK_ZONE_X_SEGMENTS.length - 1;
  const cells = [];
  for (let baseRow = 0; baseRow < rows; baseRow++) {
    for (let baseCol = 0; baseCol < cols; baseCol++) {
      const baseIndexZero = baseRow * cols + baseCol;
      if (WEAK_ZONE_EXCLUDED_BASE_CELLS.has(baseIndexZero)) continue;

      const baseMinX = WEAK_ZONE_X_SEGMENTS[baseCol];
      const baseMaxX = WEAK_ZONE_X_SEGMENTS[baseCol + 1];
      const baseMinY = WEAK_ZONE_Y_SEGMENTS[baseRow];
      const baseMaxY = WEAK_ZONE_Y_SEGMENTS[baseRow + 1];

      for (let subRow = 0; subRow < WEAK_ZONE_SUBDIVISIONS; subRow++) {
        for (let subCol = 0; subCol < WEAK_ZONE_SUBDIVISIONS; subCol++) {
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

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function hashStringToInt(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildBattleStateSeed(battle, userId, scope, bucketIndex) {
  const battleId = battle?._id || 'battle';
  const safeUserId = userId ? userId.toString() : 'global';
  return `${battleId}:${safeUserId}:${scope}:${bucketIndex}`;
}

function computeBattleScenarioDurationSeconds(battleLike) {
  const safeDuration = Math.max(0, Number(battleLike?.durationSeconds) || 0);
  if (safeDuration > 0) return safeDuration;
  if (battleLike?.firstPlayerJoinedAt) return BATTLE_BASE_DURATION_SECONDS;
  return BATTLE_NO_ENTRY_DURATION_SECONDS;
}

function buildBattleScenario(battleLike) {
  const battleId = String(battleLike?._id || battleLike?.id || `battle_${Date.now()}`);
  const durationSeconds = computeBattleScenarioDurationSeconds(battleLike);
  const durationMs = durationSeconds * 1000;
  const weakZones = [];
  const voiceCommands = [];
  const sparks = [];
  const baddieWaves = [];

  let weakCursorMs = 0;
  let weakIndex = 0;
  while (weakCursorMs < durationMs) {
    const rand = mulberry32(hashStringToInt(`${battleId}:scenario:weak:${weakIndex}`));
    const delayMs = WEAK_ZONE_DELAY_MIN_MS
      + Math.floor(rand() * (WEAK_ZONE_DELAY_MAX_MS - WEAK_ZONE_DELAY_MIN_MS + 1));
    const durationWindowMs = WEAK_ZONE_DURATION_MIN_MS
      + Math.floor(rand() * (WEAK_ZONE_DURATION_MAX_MS - WEAK_ZONE_DURATION_MIN_MS + 1));
    const startOffsetMs = weakCursorMs + delayMs;
    if (startOffsetMs >= durationMs) break;
    const endOffsetMs = Math.min(durationMs, startOffsetMs + durationWindowMs);
    const cell = WEAK_ZONE_CELLS.length
      ? WEAK_ZONE_CELLS[Math.min(WEAK_ZONE_CELLS.length - 1, Math.floor(rand() * WEAK_ZONE_CELLS.length))]
      : ENEMY_BOUNDS;
    const x = cell.minX + rand() * (cell.maxX - cell.minX);
    const y = cell.minY + rand() * (cell.maxY - cell.minY);
    weakZones.push({
      id: `weak_${weakIndex}`,
      startOffsetMs,
      endOffsetMs,
      radius: WEAK_ZONE_RADIUS,
      center: {
        x: clamp(x, ENEMY_BOUNDS.minX, ENEMY_BOUNDS.maxX),
        y: clamp(y, ENEMY_BOUNDS.minY, ENEMY_BOUNDS.maxY),
        z: ENEMY_PLANE_Z,
      },
    });
    weakCursorMs = endOffsetMs;
    weakIndex += 1;
  }

  let voiceCursorMs = 0;
  let voiceIndex = 0;
  while (voiceCursorMs < durationMs) {
    const rand = mulberry32(hashStringToInt(`${battleId}:scenario:voice:${voiceIndex}`));
    const delayMs = VOICE_COMMAND_DELAY_MIN_MS
      + Math.floor(rand() * (VOICE_COMMAND_DELAY_MAX_MS - VOICE_COMMAND_DELAY_MIN_MS + 1));
    const durationWindowMs = VOICE_COMMAND_DURATION_MIN_MS
      + Math.floor(rand() * (VOICE_COMMAND_DURATION_MAX_MS - VOICE_COMMAND_DURATION_MIN_MS + 1));
    const startOffsetMs = voiceCursorMs + delayMs;
    if (startOffsetMs >= durationMs) break;
    const endOffsetMs = Math.min(durationMs, startOffsetMs + durationWindowMs);
    const text = rand() > 0.5 ? 'СТРЕЛЯЙ' : 'СТОЙ';
    voiceCommands.push({
      id: `voice_${voiceIndex}`,
      startOffsetMs,
      endOffsetMs,
      durationMs: endOffsetMs - startOffsetMs,
      text,
      requireShot: text === 'СТОЙ',
    });
    voiceCursorMs = endOffsetMs;
    voiceIndex += 1;
  }

  let sparkCursorMs = 0;
  let sparkIndex = 0;
  while (sparkCursorMs < durationMs) {
    const rand = mulberry32(hashStringToInt(`${battleId}:scenario:spark:${sparkIndex}`));
    const delayMs = SPARK_DELAY_MIN_MS
      + Math.floor(rand() * (SPARK_DELAY_MAX_MS - SPARK_DELAY_MIN_MS + 1));
    const startOffsetMs = sparkCursorMs + delayMs;
    if (startOffsetMs >= durationMs) break;
    const x = 0.1 + rand() * 0.8;
    const y = 0.2 + rand() * 0.6;
    const angle = (rand() - 0.5) * 0.7;
    const direction = rand() > 0.5 ? 1 : -1;
    sparks.push({
      id: `spark_${sparkIndex}`,
      startOffsetMs,
      x,
      y,
      vx: Math.cos(angle) * SPARK_BASE_SPEED * direction,
      vy: Math.sin(angle) * SPARK_BASE_SPEED,
      rewardLumens: SPARK_REWARD_LUMENS,
    });
    sparkCursorMs = startOffsetMs;
    sparkIndex += 1;
  }

  const worldMin = Math.min(ENEMY_OUTLINE_WIDTH, ENEMY_OUTLINE_HEIGHT);
  const baddieSpeed = (worldMin * SPARK_BASE_SPEED) / 90;

  let baddieCursorMs = 0;
  let waveIndex = 0;
  while (baddieCursorMs < durationMs) {
    const rand = mulberry32(hashStringToInt(`${battleId}:scenario:baddie-wave:${waveIndex}`));
    const delayMs = BADDIE_DELAY_MIN_MS
      + Math.floor(rand() * (BADDIE_DELAY_MAX_MS - BADDIE_DELAY_MIN_MS + 1));
    const startOffsetMs = baddieCursorMs + delayMs;
    if (startOffsetMs >= durationMs) break;

    const edge = Math.floor(rand() * 4);
    let spawnX = 0;
    let spawnY = 0;
    if (edge === 0) {
      spawnX = ENEMY_BOUNDS.minX + rand() * ENEMY_OUTLINE_WIDTH;
      spawnY = ENEMY_BOUNDS.maxY;
    } else if (edge === 1) {
      spawnX = ENEMY_BOUNDS.maxX;
      spawnY = ENEMY_BOUNDS.minY + rand() * ENEMY_OUTLINE_HEIGHT;
    } else if (edge === 2) {
      spawnX = ENEMY_BOUNDS.minX + rand() * ENEMY_OUTLINE_WIDTH;
      spawnY = ENEMY_BOUNDS.minY;
    } else {
      spawnX = ENEMY_BOUNDS.minX;
      spawnY = ENEMY_BOUNDS.minY + rand() * ENEMY_OUTLINE_HEIGHT;
    }

    baddieWaves.push({
      id: `wave_${waveIndex}`,
      startOffsetMs,
      spheres: [{
        id: `baddie_${waveIndex}_0`,
        x: spawnX,
        y: spawnY,
        size: BADDIE_SIZE_RANGE[0] + rand() * (BADDIE_SIZE_RANGE[1] - BADDIE_SIZE_RANGE[0]),
        color: BADDIE_COLORS[Math.floor(rand() * BADDIE_COLORS.length)],
        shape: BADDIE_SHAPES[Math.floor(rand() * BADDIE_SHAPES.length)],
        speed: baddieSpeed,
      }],
    });
    baddieCursorMs = startOffsetMs;
    waveIndex += 1;
  }

  return {
    version: BATTLE_SCENARIO_VERSION,
    durationSeconds,
    sparkRewardLumens: SPARK_REWARD_LUMENS,
    baddieDamagePerTick: 1,
    baddieDamageIntervalMs: BADDIE_DAMAGE_INTERVAL_MS,
    weakZones,
    voiceCommands,
    sparks,
    baddieWaves,
  };
}

function getBattleScenario(battleLike) {
  const storedScenario = battleLike?.scenario && typeof battleLike.scenario === 'object'
    ? battleLike.scenario
    : null;
  if (storedScenario) return storedScenario;
  return buildBattleScenario(battleLike);
}

function computeBattleForceTotals(battleLike, { endedAt = null, baddieDamage = 0 } = {}) {
  const battleStartMs = battleLike?.startsAt ? new Date(battleLike.startsAt).getTime() : NaN;
  const battleEndMs = endedAt ? new Date(endedAt).getTime() : (battleLike?.endsAt ? new Date(battleLike.endsAt).getTime() : NaN);
  if (!Number.isFinite(battleStartMs) || !Number.isFinite(battleEndMs) || battleEndMs <= battleStartMs) {
    return {
      guardianDamage: Math.max(0, Number(battleLike?.lightDamage) || 0),
      darknessBaseDamage: Math.max(0, Number(battleLike?.darknessDamage) || 0),
      darknessDamageFromBaddies: Math.max(0, Number(baddieDamage) || 0),
    };
  }

  const activeUsersCount = Math.max(0, Number(battleLike?.activeUsersCountSnapshot) || 0);
  const targetHalfActiveUsers = activeUsersCount * 0.5;
  const darknessTickDamage = targetHalfActiveUsers * DARKNESS_DAMAGE_PER_TARGET_USER;
  const guardianTickBeforeJoin = targetHalfActiveUsers * GUARDIAN_DAMAGE_BEFORE_FIRST_JOIN;
  const guardianTickAfterJoin = targetHalfActiveUsers * GUARDIAN_DAMAGE_AFTER_FIRST_JOIN;
  const firstJoinMs = battleLike?.firstPlayerJoinedAt ? new Date(battleLike.firstPlayerJoinedAt).getTime() : NaN;

  const totalTicks = Math.floor(Math.max(0, battleEndMs - battleStartMs) / (TICK_SECONDS * 1000));
  const darknessBaseDamage = totalTicks * darknessTickDamage;

  let guardianDamage = 0;
  if (Number.isFinite(firstJoinMs) && firstJoinMs > battleStartMs && firstJoinMs < battleEndMs) {
    const beforeTicks = Math.floor((firstJoinMs - battleStartMs) / (TICK_SECONDS * 1000));
    const afterTicks = Math.floor(Math.max(0, battleEndMs - firstJoinMs) / (TICK_SECONDS * 1000));
    guardianDamage = beforeTicks * guardianTickBeforeJoin + afterTicks * guardianTickAfterJoin;
  } else if (Number.isFinite(firstJoinMs) && firstJoinMs <= battleStartMs) {
    guardianDamage = totalTicks * guardianTickAfterJoin;
  } else {
    guardianDamage = totalTicks * guardianTickBeforeJoin;
  }

  return {
    guardianDamage: Math.max(0, Math.round(guardianDamage)),
    darknessBaseDamage: Math.max(0, Math.round(darknessBaseDamage)),
    darknessDamageFromBaddies: Math.max(0, Math.round(Number(baddieDamage) || 0)),
  };
}

function getVoiceCommandSeedRand(battle, bucketIndex, userId = null) {
  const seedStr = buildBattleStateSeed(battle, userId, 'voice', bucketIndex);
  return mulberry32(hashStringToInt(seedStr));
}

function getVoiceCommandForBucket(battle, bucketIndex, userId = null) {
  if (!battle?.startsAt) return null;
  if (bucketIndex < 0) return null;

  const startedAt = new Date(battle.startsAt).getTime();
  let cursorMs = startedAt;
  for (let index = 0; index <= bucketIndex; index += 1) {
    const rand = getVoiceCommandSeedRand(battle, index, userId);
    const delayMs =
      VOICE_COMMAND_DELAY_MIN_MS + Math.floor(rand() * (VOICE_COMMAND_DELAY_MAX_MS - VOICE_COMMAND_DELAY_MIN_MS + 1));
    const durationMs =
      VOICE_COMMAND_DURATION_MIN_MS + Math.floor(rand() * (VOICE_COMMAND_DURATION_MAX_MS - VOICE_COMMAND_DURATION_MIN_MS + 1));
    const startAt = cursorMs + delayMs;
    const endsAt = startAt + durationMs;

    if (index === bucketIndex) {
      const roll = rand() > 0.5;
      const text = roll ? 'СТРЕЛЯЙ' : 'СТОЙ';
      const requireShot = text === 'СТОЙ';
      return {
        bucketIndex,
        id: `${bucketIndex}`,
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

function getVoiceCommandState(battle, at = new Date(), userId = null) {
  if (!battle?.startsAt) return { active: false, command: null, bucketIndex: null };

  const startedAt = new Date(battle.startsAt).getTime();
  const now = new Date(at).getTime();
  const maxCommands = Math.max(1, Math.ceil(Math.max(0, now - startedAt) / VOICE_COMMAND_DELAY_MIN_MS) + 2);

  for (let bucketIndex = 0; bucketIndex < maxCommands; bucketIndex += 1) {
    const cmd = getVoiceCommandForBucket(battle, bucketIndex, userId);
    if (!cmd) break;
    if (now < cmd.startAt) {
      return { active: false, command: null, bucketIndex: null };
    }
    if (now >= cmd.startAt && now < cmd.endsAt) {
      return { active: true, command: cmd, bucketIndex };
    }
  }

  return { active: false, command: null, bucketIndex: null };
}

function getWeakZoneState(battle, at = new Date(), userId = null) {
  const startedAt = battle?.startsAt ? new Date(battle.startsAt).getTime() : Date.now();
  const now = new Date(at).getTime();

  const maxZones = Math.max(1, Math.ceil(Math.max(0, now - startedAt) / WEAK_ZONE_DELAY_MIN_MS) + 2);
  for (let zoneIndex = 0; zoneIndex < maxZones; zoneIndex += 1) {
    const zone = getWeakZoneForIndex(battle, zoneIndex, userId);
    if (!zone) break;
    if (now < zone.startAt.getTime()) {
      break;
    }
    if (now >= zone.startAt.getTime() && now < zone.endsAt.getTime()) {
      return {
        active: true,
        center: zone.center,
        radius: zone.radius,
        startsAt: zone.startAt,
        endsAt: zone.endsAt,
      };
    }
  }

  return {
    active: false,
    center: null,
    radius: WEAK_ZONE_RADIUS,
    startsAt: null,
    endsAt: null,
  };
}

function getWeakZoneForIndex(battle, zoneIndex, userId = null) {
  if (!battle?.startsAt) return null;
  if (zoneIndex < 0) return null;

  const startedAt = new Date(battle.startsAt).getTime();
  let cursorMs = startedAt;
  for (let index = 0; index <= zoneIndex; index += 1) {
    const seedStr = buildBattleStateSeed(battle, userId, 'weak-zone', index);
    const rand = mulberry32(hashStringToInt(seedStr));
    const delayMs =
      WEAK_ZONE_DELAY_MIN_MS + Math.floor(rand() * (WEAK_ZONE_DELAY_MAX_MS - WEAK_ZONE_DELAY_MIN_MS + 1));
    const durationMs =
      WEAK_ZONE_DURATION_MIN_MS + Math.floor(rand() * (WEAK_ZONE_DURATION_MAX_MS - WEAK_ZONE_DURATION_MIN_MS + 1));
    const startAtMs = cursorMs + delayMs;
    const endAtMs = startAtMs + durationMs;

    if (index === zoneIndex) {
      const cellCount = WEAK_ZONE_CELLS.length;
      const cell = cellCount
        ? WEAK_ZONE_CELLS[Math.min(cellCount - 1, Math.floor(rand() * cellCount))]
        : ENEMY_BOUNDS;
      const x = cell.minX + rand() * (cell.maxX - cell.minX);
      const y = cell.minY + rand() * (cell.maxY - cell.minY);
      return {
        radius: WEAK_ZONE_RADIUS,
        startAt: new Date(startAtMs),
        endsAt: new Date(endAtMs),
        center: {
          x: clamp(x, ENEMY_BOUNDS.minX, ENEMY_BOUNDS.maxX),
          y: clamp(y, ENEMY_BOUNDS.minY, ENEMY_BOUNDS.maxY),
          z: ENEMY_PLANE_Z,
        },
      };
    }

    cursorMs = endAtMs;
  }

  return null;
}

module.exports = {
  buildBattleScenario,
  computeBattleForceTotals,
  getBattleScenario,
  getVoiceCommandForBucket,
  getVoiceCommandState,
  getWeakZoneForIndex,
  getWeakZoneState,
};
