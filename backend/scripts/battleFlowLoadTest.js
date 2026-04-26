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

function requestOnce(url, timeoutMs) {
  const startedAt = process.hrtime.bigint();
  return new Promise((resolve) => {
    const req = http.request(url, { method: 'GET', timeout: timeoutMs }, (res) => {
      res.on('data', () => {});
      res.on('end', () => {
        const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 400,
          statusCode: res.statusCode,
          durationMs,
        });
      });
    });

    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (error) => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      resolve({
        ok: false,
        error: error.message || 'request_error',
        durationMs,
      });
    });

    req.end();
  });
}

function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

async function runPeopleStage({ people, url, timeoutMs }) {
  const durations = [];
  const statusCounts = new Map();
  const errorCounts = new Map();

  const results = await Promise.all(
    Array.from({ length: people }, () => requestOnce(url, timeoutMs))
  );

  let ok = 0;
  for (const result of results) {
    durations.push(result.durationMs || 0);
    if (result.ok) {
      ok += 1;
      const key = String(result.statusCode);
      statusCounts.set(key, (statusCounts.get(key) || 0) + 1);
    } else if (result.statusCode) {
      const key = String(result.statusCode);
      statusCounts.set(key, (statusCounts.get(key) || 0) + 1);
    } else {
      const key = String(result.error || 'request_error');
      errorCounts.set(key, (errorCounts.get(key) || 0) + 1);
    }
  }

  return {
    people,
    ok,
    failed: people - ok,
    avg: durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : 0,
    p50: percentile(durations, 0.5),
    p95: percentile(durations, 0.95),
    p99: percentile(durations, 0.99),
    statusCounts: Object.fromEntries(statusCounts),
    errorCounts: Object.fromEntries(errorCounts),
  };
}

async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await requestOnce(url, 2000);
    if (result.ok || result.statusCode) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const port = Math.max(1, Number(args.port || 10000));
  const start = Math.max(1, Number(args.start || 500));
  const step = Math.max(1, Number(args.step || 500));
  const max = Math.max(start, Number(args.max || 5000));
  const timeoutMs = Math.max(1000, Number(args.timeout || 8000));
  const userCount = Math.max(max, Number(args.users || 5000));
  const activeUserCount = Math.max(0, Math.min(userCount, Number(args.active || 2000)));
  const pendingBoostUsers = Math.max(0, Math.min(userCount, Number(args.boosted || 0)));
  const expiringBoostUsers = Math.max(0, Math.min(userCount - pendingBoostUsers, Number(args.expiring || 0)));
  const targetUrl = `http://127.0.0.1:${port}/bench/battle/cycle`;
  const serverFile = path.join(__dirname, 'mockBenchmarkServer.js');

  console.log(`[battle-flow] новый прогон боя`);
  console.log(`[battle-flow] люди: от ${start} до ${max} шаг ${step}`);
  console.log(`[battle-flow] таймаут: ${timeoutMs}мс`);
  console.log(`[battle-flow] тестовых людей: ${userCount}, активных: ${activeUserCount}`);
  console.log(`[battle-flow] усиления: постоянные=${pendingBoostUsers}, заканчиваются=${expiringBoostUsers}, обычные=${Math.max(0, userCount - pendingBoostUsers - expiringBoostUsers)}`);

  const server = spawn(process.execPath, [serverFile], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      BENCH_PORT: String(port),
      BENCH_USER_COUNT: String(userCount),
      BENCH_ACTIVE_USER_COUNT: String(activeUserCount),
      BENCH_BATTLE_PENDING_BOOST_USERS: String(pendingBoostUsers),
      BENCH_BATTLE_EXPIRING_BOOST_USERS: String(expiringBoostUsers),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  server.stdout.on('data', (chunk) => {
    const text = String(chunk || '');
    if (text.trim()) process.stdout.write(text);
  });
  server.stderr.on('data', (chunk) => {
    const text = String(chunk || '');
    if (text.trim()) process.stderr.write(text);
  });

  try {
    const ready = await waitForServer(`http://127.0.0.1:${port}/bench/battle/cycle`, 30000);
    if (!ready) {
      throw new Error('Местный стенд не поднялся вовремя');
    }

    for (let people = start; people <= max; people += step) {
      console.log(`\n[battle-flow] стадия: ${people} людей`);
      const summary = await runPeopleStage({
        people,
        url: targetUrl,
        timeoutMs,
      });

      console.log(
        `[battle-flow] итог: людей=${summary.people} удачно=${summary.ok} ошибок=${summary.failed} ` +
        `avg=${summary.avg.toFixed(2)}ms p50=${summary.p50.toFixed(2)}ms p95=${summary.p95.toFixed(2)}ms p99=${summary.p99.toFixed(2)}ms`
      );
      console.log(`[battle-flow] коды=${JSON.stringify(summary.statusCounts)} ошибки=${JSON.stringify(summary.errorCounts)}`);

      if (summary.failed > 0) {
        console.log(`\n[battle-flow] остановка на первой стадии с ошибками: ${people} людей`);
        break;
      }
    }
  } finally {
    server.kill();
  }
}

main().catch((error) => {
  console.error('[battle-flow] FAILED');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
