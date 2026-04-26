const http = require('http');
const https = require('https');

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

function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

function formatMs(value) {
  return `${Math.round(value * 100) / 100}ms`;
}

function requestOnce(target, timeoutMs, agent) {
  const lib = target.protocol === 'https:' ? https : http;
  const startedAt = process.hrtime.bigint();
  return new Promise((resolve) => {
    const req = lib.request(target, { method: 'GET', agent, timeout: timeoutMs }, (res) => {
      res.on('data', () => {});
      res.on('end', () => {
        const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 400, statusCode: res.statusCode, durationMs });
      });
    });

    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (error) => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      resolve({ ok: false, error: error.message || 'request_error', durationMs });
    });
    req.end();
  });
}

async function runStage({ target, concurrency, durationSeconds, timeoutMs }) {
  const deadline = Date.now() + durationSeconds * 1000;
  const durations = [];
  const statusCounts = new Map();
  const errorCounts = new Map();
  let total = 0;
  let ok = 0;

  const agent = target.protocol === 'https:'
    ? new https.Agent({ keepAlive: true, maxSockets: concurrency })
    : new http.Agent({ keepAlive: true, maxSockets: concurrency });

  async function worker() {
    while (Date.now() < deadline) {
      const result = await requestOnce(target, timeoutMs, agent);
      total += 1;
      durations.push(result.durationMs);
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
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  agent.destroy();

  const totalDurationSeconds = durationSeconds || 1;
  const failed = total - ok;
  const avg = durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : 0;

  return {
    concurrency,
    durationSeconds,
    total,
    ok,
    failed,
    rps: total / totalDurationSeconds,
    avg,
    p50: percentile(durations, 0.5),
    p95: percentile(durations, 0.95),
    p99: percentile(durations, 0.99),
    statusCounts: Object.fromEntries(statusCounts),
    errorCounts: Object.fromEntries(errorCounts),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const url = String(args.url || 'http://127.0.0.1:10000/health');
  const durationSeconds = Math.max(1, Number(args.duration || 10));
  const timeoutMs = Math.max(100, Number(args.timeout || 5000));
  const stages = String(args.stages || '10,50,100').split(',').map((value) => Number(value.trim())).filter(Boolean);
  const target = new URL(url);

  console.log(`[load-test] target=${target.href}`);
  console.log(`[load-test] stages=${stages.join(', ')} duration=${durationSeconds}s timeout=${timeoutMs}ms`);

  for (const concurrency of stages) {
    console.log(`\n[load-test] stage concurrency=${concurrency} started`);
    const summary = await runStage({ target, concurrency, durationSeconds, timeoutMs });
    console.log(
      `[load-test] stage concurrency=${concurrency} done total=${summary.total} ok=${summary.ok} failed=${summary.failed} ` +
      `rps=${summary.rps.toFixed(2)} avg=${formatMs(summary.avg)} p50=${formatMs(summary.p50)} ` +
      `p95=${formatMs(summary.p95)} p99=${formatMs(summary.p99)}`
    );
    console.log(`[load-test] statuses=${JSON.stringify(summary.statusCounts)} errors=${JSON.stringify(summary.errorCounts)}`);
  }
}

main().catch((error) => {
  console.error('[load-test] FAILED');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});