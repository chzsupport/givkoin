const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const https = require('https');
const { execFile } = require('child_process');
const { collectDiagnostics } = require('./diagnoseProjectLoad');

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

function cpuSnapshot() {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  cpus.forEach((cpu) => {
    Object.values(cpu.times).forEach((value) => { total += value; });
    idle += cpu.times.idle;
  });
  return { idle, total };
}

function startSampler() {
  let last = cpuSnapshot();
  const cpuSamples = [];
  const memSamples = [];
  const interval = setInterval(() => {
    const next = cpuSnapshot();
    const idleDelta = next.idle - last.idle;
    const totalDelta = next.total - last.total;
    const usage = totalDelta > 0 ? (1 - idleDelta / totalDelta) * 100 : 0;
    cpuSamples.push(usage);
    memSamples.push(os.freemem() / 1024 / 1024);
    last = next;
  }, 1000);
  return {
    stop() {
      clearInterval(interval);
      const avgCpu = cpuSamples.length
        ? cpuSamples.reduce((sum, value) => sum + value, 0) / cpuSamples.length
        : 0;
      const maxCpu = cpuSamples.length ? Math.max(...cpuSamples) : 0;
      const minMem = memSamples.length ? Math.min(...memSamples) : os.freemem() / 1024 / 1024;
      return {
        cpuAvgPct: Math.round(avgCpu * 10) / 10,
        cpuMaxPct: Math.round(maxCpu * 10) / 10,
        memAvailMinMb: Math.round(minMem),
      };
    },
  };
}

function fetchHealth(baseUrl, timeoutMs = 5000) {
  const target = new URL('/health', baseUrl);
  const lib = target.protocol === 'https:' ? https : http;
  return new Promise((resolve) => {
    const req = lib.request(target, { method: 'GET', timeout: timeoutMs }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk.toString(); });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve(null);
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', () => resolve(null));
    req.end();
  });
}

function fetchJson(baseUrl, routePath, timeoutMs = 5000) {
  const target = new URL(routePath, baseUrl);
  const lib = target.protocol === 'https:' ? https : http;
  return new Promise((resolve) => {
    const req = lib.request(target, { method: 'GET', timeout: timeoutMs }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk.toString(); });
      res.on('end', () => {
        let data = null;
        try {
          data = JSON.parse(body);
        } catch {
          data = body;
        }
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 400, statusCode: res.statusCode, data });
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', () => resolve({ ok: false, statusCode: 0, data: null }));
    req.end();
  });
}

function runScenarioProcess({ baseUrl, scenario, duration, timeout, users, cwd }) {
  return new Promise((resolve, reject) => {
    execFile(
      'node',
      [
        'scripts/scenarioLoadTest.js',
        `--url=${baseUrl}`,
        `--scenario=${scenario}`,
        `--duration=${duration}`,
        `--timeout=${timeout}`,
        `--users=${users}`,
      ],
      { cwd, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          return reject(error);
        }
        resolve({ stdout, stderr });
      }
    );
  });
}

function parseScenarioSummary(output, users) {
  const lines = String(output || '').split(/\r?\n/);
  const index = lines.findIndex((row) => row.includes(`[scenario-test] stage users=${users} done`));
  const line = index >= 0 ? lines[index] : null;
  if (!line) return null;
  const match = line.match(/total=(\d+)\s+ok=(\d+)\s+failed=(\d+)\s+rps=([\d.]+)\s+avg=([\d.]+)ms\s+p95=([\d.]+)ms\s+p99=([\d.]+)ms/);
  if (!match) return null;
  let routes = {};
  const routeLine = index >= 0 ? lines.slice(index + 1).find((row) => row.startsWith('[scenario-test] routes=')) : null;
  if (routeLine) {
    try {
      routes = JSON.parse(routeLine.slice('[scenario-test] routes='.length));
    } catch {
      routes = {};
    }
  }
  return {
    total: Number(match[1]),
    ok: Number(match[2]),
    failed: Number(match[3]),
    rps: Number(match[4]),
    avgMs: Number(match[5]),
    p95Ms: Number(match[6]),
    p99Ms: Number(match[7]),
    routes,
  };
}

function buildStages(start, max, step) {
  const out = [];
  for (let value = start; value <= max; value += step) {
    out.push(value);
  }
  return out;
}

function toCsv(rows) {
  const header = ['scenario', 'users', 'rps', 'p95Ms', 'p99Ms', 'errRatePct', 'cpuAvgPct', 'cpuMaxPct', 'memAvailMinMb', 'serverRssMb', 'serverHeapMb', 'worstRoute'];
  const lines = [header.join(',')];
  rows.forEach((row) => {
    lines.push([
      row.scenario,
      row.users,
      row.rps,
      row.p95Ms,
      row.p99Ms,
      row.errRatePct,
      row.cpuAvgPct,
      row.cpuMaxPct,
      row.memAvailMinMb,
      row.serverRssMb,
      row.serverHeapMb,
      JSON.stringify(row.worstRoute || ''),
    ].join(','));
  });
  return lines.join('\n');
}

function pickWorstRoute(routes) {
  const entries = Object.entries(routes && typeof routes === 'object' ? routes : {});
  if (!entries.length) return '';
  entries.sort((left, right) => {
    const a = left[1] || {};
    const b = right[1] || {};
    if ((b.failed || 0) !== (a.failed || 0)) return (b.failed || 0) - (a.failed || 0);
    if ((b.total || 0) !== (a.total || 0)) return (b.total || 0) - (a.total || 0);
    return String(left[0]).localeCompare(String(right[0]));
  });
  return entries[0][0];
}

async function runSmokeChecks(baseUrl, timeout) {
  const checks = [
    '/health',
    '/bench/reset',
    '/bench/action/meditation_collective',
    '/bench/action/night_shift',
    '/bench/action/crystal',
    '/bench/action/news_full',
    '/bench/action/chat_full',
    '/bench/action/battle_full',
  ];
  const results = [];
  for (const routePath of checks) {
    // eslint-disable-next-line no-await-in-loop
    const result = await fetchJson(baseUrl, routePath, timeout);
    results.push({ routePath, ok: result.ok, statusCode: result.statusCode });
    if (!result.ok) {
      const error = new Error(`Smoke check failed for ${routePath}`);
      error.smokeResults = results;
      throw error;
    }
  }
  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = String(args.url || 'http://127.0.0.1:10000');
  const duration = Math.max(10, Number(args.duration || 20));
  const timeout = Math.max(500, Number(args.timeout || 3000));
  const startUsers = Math.max(100, Number(args.start || 500));
  const maxUsers = Math.max(startUsers, Number(args.max || 5000));
  const step = Math.max(50, Number(args.step || 500));
  const scenarios = String(args.scenarios || 'project_uniform,heavy_uniform,collective_meditation_focus,night_shift_crystal_focus,community_mix,peak_event_mix')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const cwd = path.resolve(__dirname, '..');

  const diagnostics = collectDiagnostics(path.resolve(__dirname, '..', '..'));
  const outputDir = path.join(cwd, 'bench-results');
  fs.mkdirSync(outputDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.writeFileSync(path.join(outputDir, `${stamp}_diagnostics.json`), JSON.stringify(diagnostics, null, 2));

  const smokeChecks = await runSmokeChecks(baseUrl, timeout);
  fs.writeFileSync(path.join(outputDir, `${stamp}_smoke.json`), JSON.stringify(smokeChecks, null, 2));

  const stages = buildStages(startUsers, maxUsers, step);
  const results = [];

  for (const scenario of scenarios) {
    // Start each scenario from a clean bench state so previous runs do not distort the next result.
    await fetchJson(baseUrl, '/bench/reset', timeout);
    for (const users of stages) {
      const sampler = startSampler();
      let summary = null;
      try {
        const output = await runScenarioProcess({ baseUrl, scenario, duration, timeout, users, cwd });
        summary = parseScenarioSummary(output.stdout, users);
      } catch (error) {
        summary = null;
      }
      const system = sampler.stop();
      const health = await fetchHealth(baseUrl, timeout);

      const total = summary?.total || 0;
      const failed = summary?.failed || 0;
      const errRatePct = total > 0 ? Math.round((failed / total) * 10000) / 100 : 100;
      const p95Ms = summary?.p95Ms || 0;
      const row = {
        scenario,
        users,
        rps: summary?.rps || 0,
        p95Ms,
        p99Ms: summary?.p99Ms || 0,
        errRatePct,
        cpuAvgPct: system.cpuAvgPct,
        cpuMaxPct: system.cpuMaxPct,
        memAvailMinMb: system.memAvailMinMb,
        serverRssMb: health?.memoryMb?.rss ?? null,
        serverHeapMb: health?.memoryMb?.heapUsed ?? null,
        worstRoute: pickWorstRoute(summary?.routes || {}),
      };
      results.push(row);

      const p95Over = p95Ms > 1000;
      const errorOver = total > 0 && failed / total > 0.01;
      const healthOver = !health || health.ok !== true || system.cpuAvgPct > 90;
      if (p95Over || errorOver || healthOver) {
        break;
      }
    }
  }

  fs.writeFileSync(path.join(outputDir, `${stamp}_suite.json`), JSON.stringify(results, null, 2));
  fs.writeFileSync(path.join(outputDir, `${stamp}_suite.csv`), toCsv(results));

  console.log(`[suite] wrote ${results.length} rows to ${outputDir}`);
}

main().catch((error) => {
  console.error('[suite] FAILED');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
