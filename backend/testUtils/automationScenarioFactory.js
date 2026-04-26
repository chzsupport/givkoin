function at(baseNow, { daysAgo = 0, hour = 10, minute = 0, second = 0, ms = 0 }) {
  const d = new Date(baseNow);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, second, ms);
  return d;
}

function daysAgoDate(baseNow, daysAgo) {
  return new Date(baseNow.getTime() - daysAgo * 24 * 60 * 60 * 1000);
}

function normalizeDemoTag(tag) {
  return String(tag || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function sanitizeEmailLocalPart(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function buildTaggedEmail(baseLocal, tag, domain = 'gmail.com') {
  const safeBase = sanitizeEmailLocalPart(baseLocal) || 'autodemo';
  const safeTag = sanitizeEmailLocalPart(tag);
  const local = safeTag ? `${safeBase}${safeTag}` : safeBase;
  return `${local}@${domain}`;
}

function buildTaggedNickname(baseNickname, tag) {
  const normalizedTag = normalizeDemoTag(tag).replace(/-/g, '_');
  if (!normalizedTag) return baseNickname;
  return `${baseNickname}_auto_demo_${normalizedTag}`;
}

function buildMoments(values = []) {
  return values.reduce((acc, value) => ({
    count: acc.count + 1,
    sum: acc.sum + value,
    sqSum: acc.sqSum + (value * value),
  }), { count: 0, sum: 0, sqSum: 0 });
}

function buildAutomationTelemetry({
  shots = 140,
  intervals = [],
  staticCursorShots = 110,
  hiddenTabShotCount = 8,
  cursorDistancePxTotal = 420,
  screenMinNx = 0.49,
  screenMaxNx = 0.53,
  screenMinNy = 0.48,
  screenMaxNy = 0.52,
} = {}) {
  const moments = buildMoments(intervals);
  return {
    shotTelemetryCount: shots,
    intervalCount: moments.count,
    intervalSumMs: moments.sum,
    intervalSqSumMs: moments.sqSum,
    staticCursorShots,
    hiddenTabShotCount,
    cursorDistancePxTotal,
    screenMinNx,
    screenMaxNx,
    screenMinNy,
    screenMaxNy,
  };
}

function getModules() {
  return {
    User: require('../src/models/User'),
    ActivityLog: require('../src/models/ActivityLog'),
    BehaviorEvent: require('../src/models/BehaviorEvent'),
    UserSession: require('../src/models/UserSession'),
    Battle: require('../src/models/Battle'),
    Transaction: require('../src/models/Transaction'),
    UserAchievement: require('../src/models/UserAchievement'),
  };
}

async function createUser({
  email,
  nickname,
  createdAt,
  lastDeviceId,
  lastFingerprint,
  cp = 0,
  lumens = 0,
  referredBy = null,
  achievementStats = {},
  nightShiftStats = {},
} = {}) {
  const { User } = getModules();
  return User.create({
    email,
    password: 'Password123!',
    nickname,
    gender: 'other',
    createdAt,
    updatedAt: createdAt,
    status: 'active',
    emailConfirmed: true,
    emailConfirmedAt: createdAt,
    lastDeviceId,
    lastFingerprint,
    cp,
    lumens,
    referredBy,
    achievementStats,
    nightShift: {
      isServing: false,
      stats: {
        totalTimeMs: 0,
        anomaliesCleared: 0,
        totalEarnings: { cp: 0, lm: 0, stars: 0 },
        ...nightShiftStats,
      },
    },
  });
}

async function seedLegitTimerUserScenario({ baseNow = new Date(), tag = '' } = {}) {
  const normalizedTag = normalizeDemoTag(tag);
  const legitDeviceId = normalizedTag ? `device-legit-${normalizedTag}` : 'device-legit-1';
  const legitFingerprint = normalizedTag ? `fingerprint-legit-${normalizedTag}` : 'fingerprint-legit-1';
  const { ActivityLog, UserSession } = getModules();
  const user = await createUser({
    email: buildTaggedEmail('legit.timer', tag),
    nickname: buildTaggedNickname('legit_timer_user', tag),
    createdAt: daysAgoDate(baseNow, 40),
    lastDeviceId: legitDeviceId,
    lastFingerprint: legitFingerprint,
    cp: 120,
    lumens: 320,
    achievementStats: {
      totalBridgeStones: 5,
      totalBattlesParticipated: 2,
      totalEnergyShared: 3,
      totalChatMinutes: 30,
      totalCrystalsCollected: 4,
    },
  });

  const routePlan = [
    { path: '/tree', hour: 9, minute: 10 },
    { path: '/fortune', hour: 12, minute: 5 },
    { path: '/activity/collect', hour: 15, minute: 22 },
    { path: '/bridges', hour: 19, minute: 11 },
    { path: '/battle', hour: 21, minute: 34 },
  ];

  for (let index = 0; index < routePlan.length; index += 1) {
    const plan = routePlan[index];
    const createdAt = at(baseNow, { daysAgo: index + 1, hour: plan.hour, minute: plan.minute });
    await ActivityLog.create({
      user: user._id,
      type: 'page_view',
      minutes: 0,
      meta: {
        path: plan.path,
        previousPath: index % 2 === 0 ? '/tree' : '/fortune',
        navigationSource: 'ui_click',
        viaUiClick: true,
        isDirectNavigation: false,
        chainExpected: plan.path.startsWith('/activity/') || plan.path.startsWith('/fortune/'),
        chainSatisfied: true,
        skippedPaths: [],
      },
      createdAt,
      updatedAt: createdAt,
    });
  }

  const profitRows = [
    { type: 'solar_collect', hour: 9, minute: 17, meta: { earnedLm: 100, earnedCp: 10 } },
    { type: 'bridge_contribute', hour: 12, minute: 42, meta: { stones: 1, source: 'contribute' } },
    { type: 'fortune_spin', hour: 16, minute: 9, meta: { resultType: 'cp', resultValue: 20 } },
    { type: 'battle_spark', hour: 21, minute: 40, meta: { rewardLumens: 100, rewardCp: 0 } },
    { type: 'fruit_collect', hour: 18, minute: 20, meta: { rewardType: 'lumens', reward: 40 } },
  ];

  for (let index = 0; index < profitRows.length; index += 1) {
    const row = profitRows[index];
    const createdAt = at(baseNow, { daysAgo: index + 1, hour: row.hour, minute: row.minute });
    await ActivityLog.create({
      user: user._id,
      type: row.type,
      minutes: 1,
      meta: row.meta,
      createdAt,
      updatedAt: createdAt,
    });
  }

  const sessionDurations = [95, 162, 243, 118, 301];
  for (let index = 0; index < sessionDurations.length; index += 1) {
    const startedAt = at(baseNow, { daysAgo: index + 1, hour: 8 + index, minute: 0 });
    const endedAt = new Date(startedAt.getTime() + sessionDurations[index] * 1000);
    await UserSession.create({
      sessionId: `legit-session-${index + 1}`,
      user: user._id,
      deviceId: legitDeviceId,
      fingerprint: legitFingerprint,
      startedAt,
      lastSeenAt: endedAt,
      endedAt,
      isActive: false,
    });
  }

  return { user };
}

async function seedSuspiciousAutomationClusterScenario({ baseNow = new Date(), tag = '' } = {}) {
  const {
    ActivityLog,
    BehaviorEvent,
    UserSession,
    Battle,
    Transaction,
    UserAchievement,
  } = getModules();

  const sharedStats = {
    totalDamage: 400,
    totalChatMinutes: 40,
    totalBridgeStones: 9,
    totalEnergyShared: 60,
    totalCrystalsCollected: 15,
    totalBattlesParticipated: 6,
    totalBattlesWon: 4,
    totalHoursInBattles: 2,
    totalLumensToTree: 50,
    totalNewsLikes: 1,
    totalNewsComments: 1,
    totalNewsReposts: 0,
    totalWishesCreated: 1,
    totalWishesSupported: 1,
    totalWishesFulfilled: 0,
  };
  const createdAt = daysAgoDate(baseNow, 35);
  const normalizedTag = normalizeDemoTag(tag);
  const commonDevice = normalizedTag ? `shared-device-automation-${normalizedTag}` : 'shared-device-automation';
  const commonFingerprint = normalizedTag
    ? `shared-fingerprint-automation-${normalizedTag}`
    : 'shared-fingerprint-automation';
  const nonRelatedRecipient = normalizedTag ? `non-related-recipient-${normalizedTag}` : 'non-related-recipient';

  const mainUser = await createUser({
    email: buildTaggedEmail('automation.main', tag),
    nickname: buildTaggedNickname('automation_main', tag),
    createdAt,
    lastDeviceId: commonDevice,
    lastFingerprint: commonFingerprint,
    cp: 900,
    lumens: 2500,
    achievementStats: sharedStats,
    nightShiftStats: { anomaliesCleared: 2, totalEarnings: { cp: 20, lm: 8, stars: 0 } },
  });
  const workerA = await createUser({
    email: buildTaggedEmail('automation.worker.a', tag),
    nickname: buildTaggedNickname('automation_worker_a', tag),
    createdAt,
    lastDeviceId: commonDevice,
    lastFingerprint: commonFingerprint,
    cp: 420,
    lumens: 600,
    achievementStats: sharedStats,
    nightShiftStats: { anomaliesCleared: 2, totalEarnings: { cp: 20, lm: 8, stars: 0 } },
  });
  const workerB = await createUser({
    email: buildTaggedEmail('automation.worker.b', tag),
    nickname: buildTaggedNickname('automation_worker_b', tag),
    createdAt,
    lastDeviceId: commonDevice,
    lastFingerprint: commonFingerprint,
    cp: 430,
    lumens: 650,
    achievementStats: sharedStats,
    nightShiftStats: { anomaliesCleared: 2, totalEarnings: { cp: 20, lm: 8, stars: 0 } },
  });

  const users = [mainUser, workerA, workerB];
  const intervalPattern = [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1];
  const paths = ['/activity/collect', '/fortune/roulette'];
  for (const user of users) {
    for (let day = 0; day < 12; day += 1) {
      const minuteOffset = intervalPattern[day];
      const profitAt = at(baseNow, {
        daysAgo: 12 - day,
        hour: 10,
        minute: minuteOffset,
        second: 10,
      });
      const pageAt = new Date(profitAt.getTime() - 5000);
      await ActivityLog.create({
        user: user._id,
        type: 'page_view',
        minutes: 0,
        meta: {
          path: '/activity/collect',
          previousPath: '/bridges',
          navigationSource: 'direct_open',
          viaUiClick: false,
          isDirectNavigation: true,
          chainExpected: true,
          chainSatisfied: false,
          skippedPaths: ['/tree', '/activity'],
          navigationLatencyMs: 30,
        },
        createdAt: pageAt,
        updatedAt: pageAt,
      });
      await ActivityLog.create({
        user: user._id,
        type: 'solar_collect',
        minutes: 5,
        meta: { earnedLm: 100, earnedCp: 10 },
        createdAt: profitAt,
        updatedAt: profitAt,
      });
      const navAt = new Date(profitAt.getTime() + 60 * 1000);
      await ActivityLog.create({
        user: user._id,
        type: 'page_view',
        minutes: 0,
        meta: {
          path: paths[day % paths.length],
          previousPath: '/bridges',
          navigationSource: 'direct_open',
          viaUiClick: false,
          isDirectNavigation: true,
          chainExpected: true,
          chainSatisfied: false,
          skippedPaths: ['/tree', '/fortune'],
          navigationLatencyMs: 18,
        },
        createdAt: navAt,
        updatedAt: navAt,
      });
    }

    const extraPageAt = at(baseNow, { daysAgo: 1, hour: 22, minute: 15 });
    await ActivityLog.create({
      user: user._id,
      type: 'page_view',
      minutes: 0,
      meta: {
        path: '/bridges',
        previousPath: '/tree',
        navigationSource: 'direct_open',
        viaUiClick: false,
        isDirectNavigation: true,
        chainExpected: true,
        chainSatisfied: false,
        skippedPaths: ['/tree'],
      },
      createdAt: extraPageAt,
      updatedAt: extraPageAt,
    });

    const sessionDurations = [120, 122, 118, 121, 119, 123, 117, 124];
    for (let index = 0; index < sessionDurations.length; index += 1) {
      const startedAt = at(baseNow, { daysAgo: index + 1, hour: 9, minute: 0 });
      const endedAt = new Date(startedAt.getTime() + sessionDurations[index] * 1000);
      await UserSession.create({
        sessionId: `${String(user._id)}-session-${index + 1}`,
        user: user._id,
        deviceId: commonDevice,
        fingerprint: commonFingerprint,
        startedAt,
        lastSeenAt: endedAt,
        endedAt,
        isActive: false,
      });
    }

    const achievementIds = [11, 12, 13, 14, 15];
    for (const achievementId of achievementIds) {
      const earnedAt = at(baseNow, { daysAgo: 20 - achievementId, hour: 14, minute: 0 });
      await UserAchievement.create({
        user: user._id,
        achievementId,
        earnedAt,
        createdAt: earnedAt,
        updatedAt: earnedAt,
      });
    }

    const fortuneCreditAt = at(baseNow, { daysAgo: 8, hour: 11, minute: 30 });
    await Transaction.create({
      user: user._id,
      type: 'fortune',
      direction: 'credit',
      amount: 40,
      currency: 'K',
      status: 'completed',
      occurredAt: fortuneCreditAt,
      createdAt: fortuneCreditAt,
      updatedAt: fortuneCreditAt,
    });
  }

  const requestActionTimes = [0, 30, 61, 91, 122, 152, 183, 213, 244, 274].map(
    (offset) => new Date(at(baseNow, { daysAgo: 1, hour: 12, minute: 0 }).getTime() + offset * 1000)
  );
  for (const occurredAt of requestActionTimes) {
    await BehaviorEvent.create({
      user: mainUser._id,
      category: 'http',
      eventType: 'request_action',
      sessionId: 'main-live-session',
      path: '/fortune/spin',
      meta: { method: 'POST', statusCode: 200, durationMs: 80 },
      occurredAt,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    });
  }

  const requestErrorTimes = [0, 40, 80, 120, 160].map(
    (offset) => new Date(at(baseNow, { daysAgo: 1, hour: 13, minute: 0 }).getTime() + offset * 1000)
  );
  for (const [index, occurredAt] of requestErrorTimes.entries()) {
    await BehaviorEvent.create({
      user: mainUser._id,
      category: 'http',
      eventType: 'request_error',
      sessionId: 'main-live-session',
      path: '/fortune/spin',
      meta: { method: 'POST', statusCode: index === 0 ? 429 : 400, durationMs: 95 },
      occurredAt,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    });
  }

  const revokedAt = at(baseNow, { daysAgo: 2, hour: 14, minute: 0 });
  await UserSession.create({
    sessionId: 'revoked-main-session',
    user: mainUser._id,
    deviceId: commonDevice,
    fingerprint: commonFingerprint,
    startedAt: new Date(revokedAt.getTime() - 60 * 1000),
    lastSeenAt: new Date(revokedAt.getTime() + 60 * 1000),
    endedAt: new Date(revokedAt.getTime() + 70 * 1000),
    isActive: false,
    revokedAt,
    revokeReason: 'manual_admin_revoke',
  });

  const postRevokeEvents = [20, 50].map((offset) => new Date(revokedAt.getTime() + offset * 1000));
  for (const occurredAt of postRevokeEvents) {
    await BehaviorEvent.create({
      user: mainUser._id,
      category: 'system',
      eventType: 'post_revoke_ping',
      sessionId: 'revoked-main-session',
      path: '/activity/collect',
      meta: { probe: true },
      occurredAt,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    });
  }

  const transferRows = [
    { sender: workerA, amountLm: 25, daysAgo: 1, minute: 5 },
    { sender: workerA, amountLm: 25, daysAgo: 2, minute: 10 },
    { sender: workerA, amountLm: 25, daysAgo: 3, minute: 15 },
    { sender: workerB, amountLm: 30, daysAgo: 1, minute: 20 },
    { sender: workerB, amountLm: 30, daysAgo: 2, minute: 25 },
    { sender: workerB, amountLm: 30, daysAgo: 3, minute: 30 },
  ];
  for (const row of transferRows) {
    const createdAt = at(baseNow, { daysAgo: row.daysAgo, hour: 18, minute: row.minute });
    await ActivityLog.create({
      user: row.sender._id,
      type: 'solar_share',
      minutes: 1,
      meta: {
        amountLm: row.amountLm,
        recipientId: mainUser._id,
        kAward: 5,
        starsAward: 0.001,
      },
      createdAt,
      updatedAt: createdAt,
    });
  }

  const mainOutboundRows = [
    { amountLm: 25, daysAgo: 4, minute: 5 },
    { amountLm: 25, daysAgo: 5, minute: 10 },
    { amountLm: 25, daysAgo: 6, minute: 15 },
  ];
  for (const row of mainOutboundRows) {
    const createdAt = at(baseNow, { daysAgo: row.daysAgo, hour: 18, minute: row.minute });
    await ActivityLog.create({
      user: mainUser._id,
      type: 'solar_share',
      minutes: 1,
      meta: {
        amountLm: row.amountLm,
        recipientId: nonRelatedRecipient,
        kAward: 5,
        starsAward: 0.001,
      },
      createdAt,
      updatedAt: createdAt,
    });
  }

  const battleIntervals = Array.from({ length: 100 }, (_, index) => 250 + (index % 2));
  const battleTelemetry = buildAutomationTelemetry({
    shots: 140,
    intervals: battleIntervals,
    staticCursorShots: 116,
    hiddenTabShotCount: 8,
    cursorDistancePxTotal: 350,
    screenMinNx: 0.495,
    screenMaxNx: 0.525,
    screenMinNy: 0.49,
    screenMaxNy: 0.515,
  });
  const battleAt = at(baseNow, { daysAgo: 1, hour: 20, minute: 0 });
  const battle = await Battle.create({
    status: 'finished',
    startsAt: new Date(battleAt.getTime() - 5 * 60 * 1000),
    endsAt: new Date(battleAt.getTime() + 5 * 60 * 1000),
    updatedAt: battleAt,
    createdAt: battleAt,
    attendance: users.map((user) => ({
      user: user._id,
      joinedAt: new Date(battleAt.getTime() - 60 * 1000),
      automationTelemetry: battleTelemetry,
      voiceCommandsTotalAttempts: 10,
      voiceCommandsSuccess: 0,
    })),
  });

  for (const user of users) {
    const occurredAt = new Date(battleAt.getTime() + 6 * 60 * 1000);
    await BehaviorEvent.create({
      user: user._id,
      category: 'battle',
      eventType: 'battle_result_modal_same_spot_burst',
      sessionId: `${String(user._id)}-battle-session`,
      battleId: null,
      meta: { burstClicks: 8, staticCursor: true },
      occurredAt,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    });
  }

  return { mainUser, workerA, workerB, users, battle };
}

module.exports = {
  at,
  buildAutomationTelemetry,
  buildTaggedEmail,
  buildTaggedNickname,
  normalizeDemoTag,
  seedLegitTimerUserScenario,
  seedSuspiciousAutomationClusterScenario,
};


