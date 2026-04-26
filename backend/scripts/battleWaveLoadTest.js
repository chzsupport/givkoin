const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

function parseArgs(argv) {
  const args = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const body = token.slice(2);
    const eqIndex = body.indexOf('=');
    args[eqIndex === -1 ? body : body.slice(0, eqIndex)] = eqIndex === -1 ? true : body.slice(eqIndex + 1);
  }
  return args;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requestJson(url, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const req = http.request(url, { method: 'GET', timeout: timeoutMs }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let body = null;
        try {
          body = raw ? JSON.parse(raw) : null;
        } catch {
          body = null;
        }
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 400,
          statusCode: res.statusCode,
          body,
          error: null,
        });
      });
    });

    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (error) => {
      resolve({
        ok: false,
        statusCode: null,
        body: null,
        error: error.message || 'request_error',
      });
    });

    req.end();
  });
}

async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await requestJson(url, 2000);
    if (result.ok || result.statusCode) return true;
    await sleep(500);
  }
  return false;
}

async function waitForBattleToEnd({ baseUrl, timeoutMs = 15000 }) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop
    const result = await requestJson(`${baseUrl}/bench/page?path=/battle`, 4000);
    const status = String(result.body?.status || '').trim();
    if (result.ok && (status === 'final_window' || status === 'none')) {
      return { ok: true };
    }
    // eslint-disable-next-line no-await-in-loop
    await sleep(500);
  }
  return {
    ok: false,
    reason: 'бой не перешёл в послебоевое окно вовремя',
  };
}

function chunk(array, size) {
  const out = [];
  for (let i = 0; i < array.length; i += size) {
    out.push(array.slice(i, i + size));
  }
  return out;
}

function buildStageMix(people) {
  const waves = Math.max(1, Math.floor(people / 500));
  const boostedFull = waves * 100;
  const boostedHalf = waves * 100;
  const ordinary = Math.max(0, people - boostedFull - boostedHalf);
  return { ordinary, boostedFull, boostedHalf };
}

function classifyUserIds(users, counts) {
  const ordinary = users.filter((user) => user.battleBoostProfile === 'none').slice(0, counts.ordinary);
  const boostedFull = users.filter((user) => user.battleBoostProfile === 'pending').slice(0, counts.boostedFull);
  const boostedHalf = users.filter((user) => user.battleBoostProfile === 'expiring').slice(0, counts.boostedHalf);
  return {
    ordinary,
    boostedFull,
    boostedHalf,
    all: [...ordinary, ...boostedFull, ...boostedHalf],
  };
}

function resolveBattleHeartbeatAtMs({ joinedAtMs, syncSlot, syncSlotCount, syncIntervalSeconds }) {
  const baseJoinedAtMs = Math.max(0, Math.floor(Number(joinedAtMs) || Date.now()));
  const intervalMs = Math.max(1000, Math.floor((Number(syncIntervalSeconds) || 60) * 1000));
  const slotCount = Math.max(1, Math.floor(Number(syncSlotCount) || 60));
  const slot = Math.max(0, Math.floor(Number(syncSlot) || 0)) % slotCount;

  let targetMs = baseJoinedAtMs + intervalMs;
  if (slotCount > 1) {
    const slotWindowMs = Math.max(1, Math.floor(intervalMs / slotCount));
    const cycleStartMs = Math.floor(targetMs / intervalMs) * intervalMs;
    const slotTargetMs = cycleStartMs + (slot * slotWindowMs);
    targetMs = slotTargetMs >= targetMs ? slotTargetMs : slotTargetMs + intervalMs;
  }

  return targetMs;
}

function hashBattleFinalSeed(source) {
  const text = String(source || '');
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function computeBattleFinalInitialDelayMs({
  battleId,
  userId,
  attendanceCount,
  capacity,
  retryIntervalMs,
}) {
  const safeBattleId = String(battleId || '').trim();
  const safeUserId = String(userId || '').trim();
  const safeAttendanceCount = Math.max(1, Math.floor(Number(attendanceCount) || 1));
  const safeCapacity = Math.max(1, Math.floor(Number(capacity) || 1));
  const safeRetryIntervalMs = Math.max(250, Math.floor(Number(retryIntervalMs) || 2000));
  const rounds = Math.max(1, Math.ceil(safeAttendanceCount / safeCapacity));
  const totalSpreadMs = Math.max(safeRetryIntervalMs, rounds * safeRetryIntervalMs);
  if (!safeBattleId || !safeUserId) return 0;
  return hashBattleFinalSeed(`${safeBattleId}:${safeUserId}`) % totalSpreadMs;
}

async function joinUser(baseUrl, userId, timeoutMs) {
  for (;;) {
    const result = await requestJson(`${baseUrl}/bench/battle/user/join?userId=${encodeURIComponent(userId)}`, timeoutMs);
    if (!result.ok && result.statusCode == null) {
      return {
        ok: false,
        reason: result.error || 'нет ответа при входе',
      };
    }
    const body = result.body || {};
    if (body && body.queued) {
      const retryAfterMs = Math.max(250, Number(body.retryAfterMs) || 2000);
      await sleep(retryAfterMs);
      continue;
    }
    if (result.ok && body && body.battleId) {
      return {
        ok: true,
        battleId: body.battleId,
        joinedAtMs: Date.now(),
        durationSeconds: Math.max(1, Math.floor(Number(body.durationSeconds) || 60)),
        syncSlot: Math.max(0, Math.floor(Number(body.syncSlot) || 0)),
        syncSlotCount: Math.max(1, Math.floor(Number(body.syncSlotCount) || 60)),
        syncIntervalSeconds: Math.max(1, Math.floor(Number(body.syncIntervalSeconds) || 60)),
        finalReportAcceptSeconds: Math.max(0, Math.floor(Number(body.finalReportAcceptSeconds) || 60)),
        finalReportRetryIntervalMs: Math.max(250, Math.floor(Number(body.finalReportRetryIntervalMs) || 2000)),
        finalReportWindowCapacity: Math.max(1, Math.floor(Number(body.finalReportWindowCapacity) || 2000)),
      };
    }
    return {
      ok: false,
      reason: body?.message || result.error || `плохой ответ на вход (${result.statusCode || 'без кода'})`,
    };
  }
}

async function runWaveJoins({ baseUrl, users, timeoutMs, onJoinedUser = null }) {
  let battleId = null;
  let joined = 0;
  const joinedUsers = [];
  for (const [waveIndex, waveUsers] of chunk(users, 100).entries()) {
    const waveResults = await Promise.all(waveUsers.map((user) => joinUser(baseUrl, user.userId, timeoutMs)));
    const failed = waveResults.find((row) => !row.ok);
    if (failed) {
      return {
        ok: false,
        joined,
        battleId,
        reason: failed.reason || `ошибка входа на волне ${waveIndex + 1}`,
      };
    }
    waveResults.forEach((row, index) => {
      const sourceUser = waveUsers[index];
      const joinedUser = {
        ...sourceUser,
        battleId: row.battleId,
        joinedAtMs: row.joinedAtMs,
        durationSeconds: row.durationSeconds,
        syncSlot: row.syncSlot,
        syncSlotCount: row.syncSlotCount,
        syncIntervalSeconds: row.syncIntervalSeconds,
        nextHeartbeatAtMs: resolveBattleHeartbeatAtMs(row),
        heartbeatSentCount: 0,
        heartbeatDone: false,
        heartbeatInFlight: false,
        finalReportRetryIntervalMs: row.finalReportRetryIntervalMs,
        finalReportWindowCapacity: row.finalReportWindowCapacity,
      };
      joinedUsers.push(joinedUser);
      if (typeof onJoinedUser === 'function') {
        onJoinedUser(joinedUser);
      }
    });
    joined += waveResults.length;
    battleId = battleId || waveResults[0]?.battleId || null;
    if ((waveIndex + 1) < Math.ceil(users.length / 100)) {
      await sleep(2000);
    }
  }
  return { ok: true, joined, battleId, joinedUsers };
}

async function sendBattleHeartbeat({ baseUrl, user, timeoutMs }) {
  const expire = user.battleBoostProfile === 'expiring' ? '&expire=1' : '';
  const result = await requestJson(
    `${baseUrl}/bench/battle/user/heartbeat?userId=${encodeURIComponent(user.userId)}&battleId=${encodeURIComponent(user.battleId)}&withReport=1${expire}`,
    timeoutMs,
  );

  if (!result.ok && Number(result.statusCode) === 409 && result.body?.battleEnded) {
    return {
      ok: true,
      battleEnded: true,
    };
  }

  const endedMessage = String(result.body?.message || '').trim();
  if (
    !result.ok
    && Number(result.statusCode) === 400
    && (endedMessage === 'Бой не активен' || endedMessage === 'Бой уже закончился')
  ) {
    return {
      ok: true,
      battleEnded: true,
    };
  }

  if (!result.ok) {
    return {
      ok: false,
      reason: result.body?.message || result.error || `ошибка минутного сигнала (${result.statusCode || 'без кода'})`,
    };
  }

  return { ok: true };
}

async function runScheduledHeartbeats({
  baseUrl,
  heartbeatQueue,
  timeoutMs,
  battleEndsAtMs = null,
  repeatUntilBattleEnd = false,
}) {
  let sent = 0;

  for (;;) {
    if (heartbeatQueue.cancelled) {
      return { ok: true, sent, cancelled: true };
    }

    const pendingUsers = heartbeatQueue.users.filter((user) => !user.heartbeatDone && !user.heartbeatInFlight);
    if (!pendingUsers.length) {
      if (heartbeatQueue.doneAdding) {
        return { ok: true, sent };
      }
      await sleep(200);
      continue;
    }

    pendingUsers.sort((left, right) => left.nextHeartbeatAtMs - right.nextHeartbeatAtMs);
    const nowMs = Date.now();
    const nextAtMs = pendingUsers[0].nextHeartbeatAtMs;
    if (nextAtMs > nowMs) {
      await sleep(Math.min(250, nextAtMs - nowMs));
      continue;
    }

    const dueUsers = pendingUsers.filter((user) => user.nextHeartbeatAtMs <= (nowMs + 50));
    dueUsers.forEach((user) => {
      user.heartbeatInFlight = true;
    });

    const results = await Promise.all(dueUsers.map((user) => sendBattleHeartbeat({
      baseUrl,
      user,
      timeoutMs,
    })));

    const failedIndex = results.findIndex((row) => !row.ok);
    if (failedIndex >= 0) {
      const failed = results[failedIndex];
      const failedUser = dueUsers[failedIndex];
      heartbeatQueue.failure = {
        ok: false,
        sent,
        userId: failedUser?.userId || null,
        reason: failed.reason || 'ошибка минутного сигнала',
      };
      return heartbeatQueue.failure;
    }

    dueUsers.forEach((user, index) => {
      const response = results[index] || {};
      user.heartbeatInFlight = false;
      user.heartbeatSentCount = Math.max(0, Number(user.heartbeatSentCount) || 0) + 1;
      if (response.battleEnded === true) {
        user.heartbeatDone = true;
      } else if (!repeatUntilBattleEnd || !Number.isFinite(Number(battleEndsAtMs))) {
        user.heartbeatDone = true;
      } else {
        const nextHeartbeatAtMs = Number(user.nextHeartbeatAtMs) + (Math.max(1, Number(user.syncIntervalSeconds) || 60) * 1000);
        if (nextHeartbeatAtMs >= Number(battleEndsAtMs)) {
          user.heartbeatDone = true;
        } else {
          user.nextHeartbeatAtMs = nextHeartbeatAtMs;
        }
      }
      sent += 1;
    });
  }
}

async function runScheduledFinalReports({
  baseUrl,
  users,
  battleId,
  timeoutMs,
  endedAtMs,
  reportAcceptSeconds,
  retryIntervalMs = 2000,
}) {
  const safeRetryIntervalMs = Math.max(250, Math.floor(Number(retryIntervalMs) || 2000));
  const reportWindowEndsAtMs = Math.max(
    Math.floor(Number(endedAtMs) || Date.now()),
    Math.floor(Number(endedAtMs) || Date.now()) + (Math.max(1, Math.floor(Number(reportAcceptSeconds) || 60)) * 1000),
  );
  const pendingUsers = users
    .filter((user) => Boolean(user?.hasFinalTail))
    .map((user) => ({
      ...user,
      nextFinalAttemptAtMs: Math.max(
        Math.floor(Number(endedAtMs) || Date.now()),
        Date.now(),
      ) + computeBattleFinalInitialDelayMs({
        battleId,
        userId: user.userId,
        attendanceCount: users.length,
        capacity: Number(user.finalReportWindowCapacity) || 2000,
        retryIntervalMs: safeRetryIntervalMs,
      }),
      finalReportSent: false,
      finalReportInFlight: false,
    }));

  let sent = 0;
  for (;;) {
    const availableUsers = pendingUsers.filter((user) => !user.finalReportSent && !user.finalReportInFlight);
    if (!availableUsers.length) {
      return { ok: true, sent };
    }

    const nowMs = Date.now();
    if (nowMs > reportWindowEndsAtMs) {
      return {
        ok: false,
        reason: `окно последних отчётов закрылось, не успели ${availableUsers.length}`,
      };
    }

    availableUsers.sort((left, right) => left.nextFinalAttemptAtMs - right.nextFinalAttemptAtMs);
    const nextAtMs = availableUsers[0].nextFinalAttemptAtMs;
    if (nextAtMs > nowMs) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(Math.min(250, nextAtMs - nowMs));
      continue;
    }

    const dueUsers = availableUsers.filter((user) => user.nextFinalAttemptAtMs <= (nowMs + 50));
    dueUsers.forEach((user) => {
      user.finalReportInFlight = true;
    });

    const results = await Promise.all(dueUsers.map((user) =>
      requestJson(
        `${baseUrl}/bench/battle/user/final?userId=${encodeURIComponent(user.userId)}&battleId=${encodeURIComponent(battleId)}`,
        timeoutMs,
      )
    ));

    const failedIndex = results.findIndex((row) => !row.ok || !row.body?.ok);
    if (failedIndex >= 0) {
      const failed = results[failedIndex];
      return {
        ok: false,
        reason: failed.body?.message || failed.error || `ошибка итогового отчёта (${failed.statusCode || 'без кода'})`,
      };
    }

    dueUsers.forEach((user, index) => {
      const response = results[index]?.body || {};
      user.finalReportInFlight = false;

      if (response.accepted || response.ignored) {
        user.finalReportSent = true;
        sent += 1;
        return;
      }

      user.nextFinalAttemptAtMs = Date.now() + Math.max(
        safeRetryIntervalMs,
        Math.floor(Number(response.retryAfterMs) || Number(user.finalReportRetryIntervalMs) || safeRetryIntervalMs),
      );
    });
  }
}

async function requestBattleSummaryUntilReady({ baseUrl, user, battleId, timeoutMs, stage = 'basic' }) {
  const requestTimeoutMs = stage === 'full'
    ? Math.max(60000, timeoutMs)
    : timeoutMs;
  const maxWaitMs = stage === 'full'
    ? Math.max(15 * 60 * 1000, timeoutMs * 200)
    : Math.max(2 * 60 * 1000, timeoutMs * 30);
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    const result = await requestJson(
      `${baseUrl}/bench/battle/user/summary?userId=${encodeURIComponent(user.userId)}&battleId=${encodeURIComponent(battleId)}`,
      requestTimeoutMs,
    );

    if (!result.ok) {
      return {
        ok: false,
        reason: result.body?.message || result.error || `ошибка выдачи результата (${result.statusCode || 'без кода'})`,
      };
    }

    if (result.body?.ok) {
      if (stage === 'full' && (result.body?.detailsPending || result.body?.isComplete === false)) {
        const retryAfterMs = Math.max(1000, Math.floor(Number(result.body.detailsRetryAfterMs) || 3000));
        await sleep(retryAfterMs);
        continue;
      }
      return { ok: true };
    }

    if (result.body?.pending) {
      const retryAfterMs = Math.max(250, Math.floor(Number(result.body.retryAfterMs) || 1000));
      await sleep(retryAfterMs);
      continue;
    }

    return {
      ok: false,
      reason: result.body?.message || 'итог боя не готов',
    };
  }

  return {
    ok: false,
    reason: stage === 'full'
      ? 'подробный разбор не подготовился даже за долгое ожидание'
      : 'короткий итог не подготовился вовремя',
  };
}

async function waitForSummaryStats({ baseUrl, battleId, expectedCount, timeoutMs, mode = 'basic' }) {
  const deadline = Date.now() + Math.max(30000, timeoutMs * 5);
  while (Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop
    const result = await requestJson(
      `${baseUrl}/bench/battle/summary-stats?battleId=${encodeURIComponent(battleId)}`,
      timeoutMs,
    );
    if (!result.ok) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(500);
      continue;
    }

    const totalCount = Math.max(0, Math.floor(Number(result.body?.totalCount) || 0));
    const completeCount = Math.max(0, Math.floor(Number(result.body?.completeCount ?? result.body?.fullCount) || 0));
    if (mode === 'full' && completeCount >= expectedCount) {
      return { ok: true };
    }
    if (mode !== 'full' && totalCount >= expectedCount) {
      return { ok: true };
    }

    // eslint-disable-next-line no-await-in-loop
    await sleep(500);
  }

  return {
    ok: false,
    reason: mode === 'full'
      ? 'подробные итоги не подготовились всем вовремя'
      : 'короткие итоги не подготовились всем вовремя',
  };
}

async function runSummaryReadsForAll({
  baseUrl,
  users,
  battleId,
  timeoutMs,
  stage = 'basic',
  concurrency = 100,
}) {
  const safeUsers = Array.isArray(users) ? users : [];
  if (!safeUsers.length) {
    return { ok: true };
  }

  const safeConcurrency = Math.max(1, Math.min(safeUsers.length, Math.floor(Number(concurrency) || 1)));
  let failed = null;
  let nextIndex = 0;

  const worker = async () => {
    while (!failed) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= safeUsers.length) {
        return;
      }

      const user = safeUsers[currentIndex];
      // eslint-disable-next-line no-await-in-loop
      const result = await requestBattleSummaryUntilReady({
        baseUrl,
        user,
        battleId,
        timeoutMs,
        stage,
      });

      if (!result.ok) {
        failed = {
          ...result,
          userId: user?.userId || null,
        };
        return;
      }
    }
  };

  await Promise.all(Array.from({ length: safeConcurrency }, () => worker()));
  if (failed) {
    return failed;
  }
  return { ok: true };
}

async function runDetailedSummaryReads({ baseUrl, users, battleId, timeoutMs }) {
  return runSummaryReadsForAll({
    baseUrl,
    users,
    battleId,
    timeoutMs,
    stage: 'full',
    concurrency: 10,
  });
}

async function runStage({
  people,
  port,
  timeoutMs,
  mode = 'after',
  durationSeconds = 180,
  tailUsers = 1000,
}) {
  const mix = buildStageMix(people);
  const baseUrl = `http://127.0.0.1:${port}`;
  const serverFile = path.join(__dirname, 'mockBenchmarkServer.js');
  const server = spawn(process.execPath, [serverFile], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      BENCH_PORT: String(port),
      BENCH_USER_COUNT: String(people),
      BENCH_ACTIVE_USER_COUNT: String(people),
      BENCH_BATTLE_PENDING_BOOST_USERS: String(mix.boostedFull),
      BENCH_BATTLE_EXPIRING_BOOST_USERS: String(mix.boostedHalf),
      BENCH_BATTLE_DURATION_SECONDS: String(mode === 'full' ? durationSeconds : 3600),
      BENCH_BATTLE_PLAN_MINUTES: String(mode === 'full' ? Math.max(1, Math.ceil(durationSeconds / 60)) : 1),
      BENCH_BATTLE_TAIL_USER_COUNT: String(Math.max(0, Math.min(people, tailUsers))),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  server.stdout.on('data', (chunk) => {
    const text = String(chunk || '');
    if (text.includes('[mock-bench] listening') || text.includes('[mock-bench] seeded')) {
      process.stdout.write(text);
    }
  });
  server.stderr.on('data', (chunk) => process.stderr.write(String(chunk || '')));
  server.on('exit', (code, signal) => {
    process.stdout.write(`[battle-wave] стенд завершился code=${code == null ? 'null' : code} signal=${signal || 'none'}\n`);
  });

  try {
    const ready = await waitForServer(`${baseUrl}/bench/battle/users`, 30000);
    if (!ready) {
      return { ok: false, phase: 'до входа', reason: 'стенд боя не поднялся вовремя', mix };
    }

    const usersResult = await requestJson(`${baseUrl}/bench/battle/users`, timeoutMs);
    if (!usersResult.ok || !Array.isArray(usersResult.body?.users)) {
      return { ok: false, phase: 'до входа', reason: 'не удалось получить список тестовых людей', mix };
    }

    const stageUsers = classifyUserIds(usersResult.body.users, mix);
    if (stageUsers.all.length !== people) {
      return {
        ok: false,
        phase: 'до входа',
        reason: 'стенд собрал неверное распределение людей по усилениям',
        mix,
      };
    }

    const heartbeatQueue = {
      users: [],
      doneAdding: false,
      cancelled: false,
      failure: null,
    };
    const battleEndsAtMs = Date.now() + (Math.max(60, Math.floor(Number(durationSeconds) || 180)) * 1000);
    const heartbeatPromise = runScheduledHeartbeats({
      baseUrl,
      heartbeatQueue,
      timeoutMs,
      battleEndsAtMs,
      repeatUntilBattleEnd: mode === 'full',
    });

    const joinResult = await runWaveJoins({
      baseUrl,
      users: stageUsers.all,
      timeoutMs,
      onJoinedUser: (joinedUser) => {
        heartbeatQueue.users.push(joinedUser);
      },
    });
    heartbeatQueue.doneAdding = true;
    if (!joinResult.ok) {
      heartbeatQueue.cancelled = true;
      await heartbeatPromise.catch(() => null);
      return { ok: false, phase: 'до входа', reason: joinResult.reason, mix, joined: joinResult.joined || 0 };
    }

    if (mode !== 'full') {
      const heartbeatResult = await heartbeatPromise;
      if (!heartbeatResult.ok) {
        return { ok: false, phase: 'во время боя', reason: heartbeatResult.reason, mix, joined: joinResult.joined };
      }

      await sleep(2000);

      const endNowResult = await requestJson(`${baseUrl}/bench/battle/end-now`, timeoutMs);
      if (!endNowResult.ok || !endNowResult.body?.ok) {
        return {
          ok: false,
          phase: 'после боя',
          reason: `закрытие боя: ${endNowResult.body?.message || endNowResult.error || 'не удалось закрыть бой'}`,
          mix,
          joined: joinResult.joined,
        };
      }
    } else if (Date.now() < battleEndsAtMs) {
      await sleep(Math.max(0, battleEndsAtMs - Date.now()));
    }

    if (mode === 'full') {
      const battleEndedResult = await waitForBattleToEnd({ baseUrl, timeoutMs: 15000 });
      if (!battleEndedResult.ok) {
        return {
          ok: false,
          phase: 'после боя',
          reason: battleEndedResult.reason,
          mix,
          joined: joinResult.joined,
        };
      }
    }

    const finalReportAcceptSeconds = Math.max(
      1,
      Math.floor(Number(joinResult.joinedUsers?.[0]?.finalReportAcceptSeconds) || 60),
    );
    const finalReportRetryIntervalMs = Math.max(
      250,
      Math.floor(Number(joinResult.joinedUsers?.[0]?.finalReportRetryIntervalMs) || 2000),
    );
    const finalReportsResult = await runScheduledFinalReports({
      baseUrl,
      users: joinResult.joinedUsers || [],
      battleId: joinResult.battleId,
      timeoutMs,
      endedAtMs: Date.now(),
      reportAcceptSeconds: finalReportAcceptSeconds,
      retryIntervalMs: finalReportRetryIntervalMs,
    });
    if (!finalReportsResult.ok) {
      return { ok: false, phase: 'после боя', reason: `последние отчёты: ${finalReportsResult.reason}`, mix, joined: joinResult.joined };
    }

    const heartbeatResult = await heartbeatPromise;
    if (!heartbeatResult.ok) {
      return { ok: false, phase: 'во время боя', reason: heartbeatResult.reason, mix, joined: joinResult.joined };
    }

    await sleep(1500);

    const summariesResult = await runSummaryReadsForAll({
      baseUrl,
      users: joinResult.joinedUsers || [],
      battleId: joinResult.battleId,
      timeoutMs,
      concurrency: 100,
    });
    if (!summariesResult.ok) {
      const userReason = summariesResult.userId ? ` у человека ${summariesResult.userId}` : '';
      return { ok: false, phase: 'после боя', reason: `короткий итог${userReason}: ${summariesResult.reason}`, mix, joined: joinResult.joined };
    }

    const detailedSummariesResult = await runDetailedSummaryReads({
      baseUrl,
      users: joinResult.joinedUsers || [],
      battleId: joinResult.battleId,
      timeoutMs,
    });
    if (!detailedSummariesResult.ok) {
      const userReason = detailedSummariesResult.userId ? ` у человека ${detailedSummariesResult.userId}` : '';
      return { ok: false, phase: 'подробный разбор', reason: `подробный разбор${userReason}: ${detailedSummariesResult.reason}`, mix, joined: joinResult.joined };
    }

    return {
      ok: true,
      mix,
      joined: joinResult.joined,
    };
  } finally {
    server.kill();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = String(args.mode || 'after').trim() === 'full' ? 'full' : 'after';
  const start = Math.max(500, Number(args.start || 500));
  const step = Math.max(500, Number(args.step || 500));
  const max = Math.max(start, Number(args.max || 5000));
  const timeoutMs = Math.max(2000, Number(args.timeout || 8000));
  const basePort = Math.max(10001, Number(args.port || 10010));
  const durationSeconds = Math.max(60, Number(args.duration || 180));
  const tailUsers = Math.max(0, Number(args.tail || 1000));

  console.log('[battle-wave] новый волновой прогон боя');
  console.log(`[battle-wave] стадии: от ${start} до ${max} шаг ${step}`);
  console.log(`[battle-wave] режим: ${mode === 'full' ? 'полный бой' : 'быстрый хвост после боя'}`);
  console.log('[battle-wave] вход: по 100 человек каждые 2 секунды');
  console.log('[battle-wave] первый минутный отчёт: не раньше чем через 60 секунд после входа');
  console.log('[battle-wave] 60 мест: минутные отчёты идут по личным секундам');
  console.log(`[battle-wave] после боя: до 60 секунд добираем опоздавшие отчёты, повтор последних пакетов каждые 2 секунды`);
  console.log(`[battle-wave] после боя: сервер принимает не больше 2000 последних пакетов за 2 секунды`);
  console.log(`[battle-wave] хвост после боя: ${tailUsers}`);
  if (mode === 'full') {
    console.log(`[battle-wave] длительность боя: ${durationSeconds} секунд`);
  }
  console.log('[battle-wave] после боя: экран итога открывается сразу');
  console.log('[battle-wave] после боя: личные строки готовы раньше, остальное доготавливается позже');
  console.log('[battle-wave] проверка итогов: для всех людей, без выборки');

  for (let people = start; people <= max; people += step) {
    const mix = buildStageMix(people);
    console.log(`\n[battle-wave] стадия ${people} людей`);
    console.log(`[battle-wave] обычные=${mix.ordinary} усиление до конца=${mix.boostedFull} усиление до середины=${mix.boostedHalf}`);

    const result = await runStage({
      people,
      port: basePort + Math.floor((people - start) / step),
      timeoutMs,
      mode,
      durationSeconds,
      tailUsers,
    });

    if (!result.ok) {
      console.log(`[battle-wave] остановка на стадии ${people}`);
      console.log(`[battle-wave] где ошибка: ${result.phase}`);
      console.log(`[battle-wave] что мешает: ${result.reason}`);
      if (typeof result.joined === 'number') {
        console.log(`[battle-wave] сколько людей успели пройти до сбоя: ${result.joined}`);
      }
      return;
    }

    console.log(`[battle-wave] стадия ${people} пройдена без ошибок`);
  }

  console.log('\n[battle-wave] прогон успешно завершился и ошибок нет');
}

main().catch((error) => {
  console.error('[battle-wave] FAILED');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
