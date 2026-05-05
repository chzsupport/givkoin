const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const https = require('https');
const { spawn, execFile } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const BACKEND_DIR = path.join(ROOT_DIR, 'backend');
const BENCH_SERVER = path.join(BACKEND_DIR, 'scripts', 'mockBenchmarkServer.js');
const SCENARIO_RUNNER = path.join(BACKEND_DIR, 'scripts', 'scenarioLoadTest.js');
const DIAGNOSE_RUNNER = path.join(BACKEND_DIR, 'scripts', 'diagnoseProjectLoad.js');

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

function toNumber(value, fallback, min = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, parsed);
}

function buildStages(start, max, step) {
  const out = [];
  for (let value = start; value <= max; value += step) out.push(value);
  return out;
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
      const cpuAvgPct = cpuSamples.length
        ? cpuSamples.reduce((sum, value) => sum + value, 0) / cpuSamples.length
        : 0;
      const cpuMaxPct = cpuSamples.length ? Math.max(...cpuSamples) : 0;
      const memAvailMinMb = memSamples.length ? Math.min(...memSamples) : os.freemem() / 1024 / 1024;
      return {
        cpuAvgPct: Math.round(cpuAvgPct * 10) / 10,
        cpuMaxPct: Math.round(cpuMaxPct * 10) / 10,
        memAvailMinMb: Math.round(memAvailMinMb),
      };
    },
  };
}

function requestJson(baseUrl, routePath, timeoutMs = 5000) {
  const target = new URL(routePath, baseUrl);
  const lib = target.protocol === 'https:' ? https : http;
  return new Promise((resolve) => {
    const req = lib.request(target, { method: 'GET', timeout: timeoutMs }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let body = null;
        try {
          body = raw ? JSON.parse(raw) : null;
        } catch {
          body = raw;
        }
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 400,
          statusCode: res.statusCode,
          body,
          error: '',
        });
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (error) => resolve({
      ok: false,
      statusCode: 0,
      body: null,
      error: error.message || 'request_error',
    }));
    req.end();
  });
}

async function waitForServer(baseUrl, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await requestJson(baseUrl, '/health', 2000);
    if (result.ok) return true;
    await sleep(500);
  }
  return false;
}

function runProcess(file, args, options) {
  return new Promise((resolve) => {
    execFile(process.execPath, [file, ...args], {
      cwd: options.cwd,
      env: options.env || process.env,
      maxBuffer: 50 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        code: error?.code || 0,
        error: error ? (error.stack || error.message || String(error)) : '',
        stdout: String(stdout || ''),
        stderr: String(stderr || ''),
      });
    });
  });
}

function parseScenarioSummary(output, stageUsers) {
  const lines = String(output || '').split(/\r?\n/);
  const index = lines.findIndex((row) => row.includes(`[scenario-test] stage users=${stageUsers} done`));
  const line = index >= 0 ? lines[index] : '';
  const match = line.match(/total=(\d+)\s+ok=(\d+)\s+failed=(\d+)\s+rps=([\d.]+)\s+avg=([\d.]+)ms\s+p95=([\d.]+)ms\s+p99=([\d.]+)ms/);
  if (!match) return null;

  let routes = {};
  const routeLine = lines.slice(index + 1).find((row) => row.startsWith('[scenario-test] routes='));
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

function riskLevel(row) {
  if (!row.summary) return 'failed';
  if (row.errRatePct > 3 || row.p95Ms > 3000 || row.cpuAvgPct > 95) return 'critical';
  if (row.errRatePct > 1 || row.p95Ms > 1500 || row.cpuAvgPct > 85) return 'warning';
  return 'ok';
}

async function smokeChecks(baseUrl, timeoutMs) {
  const checks = [
    '/health',
    '/bench/info',
    '/bench/page?path=/news',
    '/bench/page?path=/battle',
    '/bench/page?path=/tree',
    '/bench/action/news_full',
    '/bench/action/chat_full',
    '/bench/action/battle_full',
    '/bench/action/night_shift',
    '/bench/action/crystal',
    '/bench/action/meditation_collective',
  ];
  const results = [];
  for (const routePath of checks) {
    // eslint-disable-next-line no-await-in-loop
    const result = await requestJson(baseUrl, routePath, timeoutMs);
    results.push({
      routePath,
      ok: result.ok,
      statusCode: result.statusCode,
      error: result.error || '',
    });
  }
  return results;
}

function csvValue(value) {
  const text = String(value ?? '');
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function writeCsv(filePath, rows) {
  const header = [
    'scenario',
    'users',
    'risk',
    'requests',
    'ok',
    'failed',
    'errRatePct',
    'rps',
    'avgMs',
    'p95Ms',
    'p99Ms',
    'cpuAvgPct',
    'cpuMaxPct',
    'memAvailMinMb',
    'serverRssMb',
    'serverHeapMb',
    'worstRoute',
  ];
  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push(header.map((key) => csvValue(row[key])).join(','));
  }
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
}

function scenarioTitle(name) {
  const map = {
    project_uniform: 'равномерно по сайту',
    heavy_uniform: 'тяжелые механики равномерно',
    community_mix: 'новости, чат, бой, медитация, сбор',
    peak_event_mix: 'пиковое событие',
    collective_meditation_focus: 'коллективная медитация',
    night_shift_crystal_focus: 'ночная смена и осколки',
    battle_only: 'только бой',
    news_only: 'только новости',
    chat_only: 'только чат',
    crystal_only: 'только осколки',
    night_shift_plus_crystal: 'ночная смена и осколки',
  };
  return map[name] || name;
}

function buildSummaryMarkdown({ rows, diagnostics, smoke, startedAt, finishedAt, outputDir }) {
  const sortedByP95 = [...rows]
    .filter((row) => row.summary)
    .sort((a, b) => (b.p95Ms || 0) - (a.p95Ms || 0))
    .slice(0, 10);
  const risky = rows.filter((row) => row.risk !== 'ok');
  const maxOkByScenario = new Map();
  for (const row of rows) {
    if (row.risk !== 'ok') continue;
    const prev = maxOkByScenario.get(row.scenario) || 0;
    maxOkByScenario.set(row.scenario, Math.max(prev, row.users));
  }
  const pageCount = Array.isArray(diagnostics?.pages) ? diagnostics.pages.length : 0;
  const endpointCount = Array.isArray(diagnostics?.backendEndpoints) ? diagnostics.backendEndpoints.length : 0;

  const lines = [];
  lines.push('# Отчет локальной нагрузки');
  lines.push('');
  lines.push(`Начало: ${startedAt}`);
  lines.push(`Конец: ${finishedAt}`);
  lines.push(`Папка: ${outputDir}`);
  lines.push('');
  lines.push('## Охват');
  lines.push('');
  lines.push(`- Страниц найдено: ${pageCount}`);
  lines.push(`- Серверных адресов найдено: ${endpointCount}`);
  lines.push(`- Дымовая проверка: ${smoke.every((row) => row.ok) ? 'прошла' : 'есть ошибки'}`);
  lines.push('');
  lines.push('## Максимум без тревожных признаков');
  lines.push('');
  if (maxOkByScenario.size) {
    for (const [scenario, users] of [...maxOkByScenario.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])))) {
      lines.push(`- ${scenarioTitle(scenario)}: ${users} пользователей`);
    }
  } else {
    lines.push('- Нет стадии без тревожных признаков.');
  }
  lines.push('');
  lines.push('## Самые тяжелые замеры');
  lines.push('');
  if (sortedByP95.length) {
    for (const row of sortedByP95) {
      lines.push(`- ${scenarioTitle(row.scenario)}, ${row.users} пользователей: p95 ${row.p95Ms} мс, ошибок ${row.errRatePct}%, тяжелый путь: ${row.worstRoute || 'нет данных'}`);
    }
  } else {
    lines.push('- Нет данных.');
  }
  lines.push('');
  lines.push('## Что смотреть первым');
  lines.push('');
  if (risky.length) {
    const riskyScenarios = [...new Set(risky.map((row) => scenarioTitle(row.scenario)))];
    riskyScenarios.slice(0, 8).forEach((name) => {
      lines.push(`- ${name}`);
    });
  } else {
    lines.push('- По этим порогам явных провалов нет. Дальше стоит увеличивать длительность стадии.');
  }
  lines.push('');
  lines.push('## Важное ограничение');
  lines.push('');
  lines.push('Этот прогон использует локальный стенд с памятью процесса, чтобы не трогать настоящую базу. Для окончательного замера нужен запуск реального backend + frontend на локальной Supabase.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const port = Math.floor(toNumber(args.port, 10000, 1));
  const start = Math.floor(toNumber(args.start, 500, 1));
  const step = Math.floor(toNumber(args.step, 500, 1));
  const max = Math.floor(toNumber(args.max, 5000, start));
  const userCount = Math.floor(toNumber(args.users, max, max));
  const activeUsers = Math.floor(toNumber(args.active, userCount, 0));
  const duration = Math.floor(toNumber(args.duration, 20, 10));
  const timeout = Math.floor(toNumber(args.timeout, 8000, 500));
  const stopOnRisk = args['stop-on-risk'] === true || args.stopOnRisk === true;
  const scenarios = String(args.scenarios || 'project_uniform,community_mix,heavy_uniform,battle_only,news_only,chat_only,night_shift_plus_crystal,collective_meditation_focus')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const runStamp = stamp();
  const outputDir = path.resolve(String(args.out || path.join(__dirname, 'results', runStamp)));
  fs.mkdirSync(outputDir, { recursive: true });
  const logsDir = path.join(outputDir, 'logs');
  fs.mkdirSync(logsDir, { recursive: true });

  const baseUrl = `http://127.0.0.1:${port}`;
  const startedAt = new Date().toISOString();
  const serverLog = fs.createWriteStream(path.join(logsDir, 'bench-server.log'), { flags: 'a' });
  const server = spawn(process.execPath, [BENCH_SERVER], {
    cwd: BACKEND_DIR,
    env: {
      ...process.env,
      BENCH_PORT: String(port),
      BENCH_USER_COUNT: String(userCount),
      BENCH_ACTIVE_USER_COUNT: String(activeUsers),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  server.stdout.on('data', (chunk) => serverLog.write(chunk));
  server.stderr.on('data', (chunk) => serverLog.write(chunk));

  const rows = [];
  let diagnostics = null;
  let smoke = [];

  try {
    const ready = await waitForServer(baseUrl, 45000);
    if (!ready) {
      throw new Error(`Локальный стенд не поднялся на ${baseUrl}. Проверь ${path.join(logsDir, 'bench-server.log')}`);
    }

    const diagnosticsPath = path.join(outputDir, 'diagnostics.json');
    const diagResult = await runProcess(DIAGNOSE_RUNNER, ['--json', '--out', diagnosticsPath], { cwd: ROOT_DIR });
    if (!diagResult.ok) {
      fs.writeFileSync(path.join(logsDir, 'diagnostics-error.log'), `${diagResult.stdout}\n${diagResult.stderr}\n${diagResult.error}`, 'utf8');
    } else {
      diagnostics = JSON.parse(fs.readFileSync(diagnosticsPath, 'utf8'));
    }

    smoke = await smokeChecks(baseUrl, timeout);
    fs.writeFileSync(path.join(outputDir, 'smoke.json'), JSON.stringify(smoke, null, 2), 'utf8');
    if (smoke.some((row) => !row.ok)) {
      throw new Error('Дымовая проверка стенда не прошла. Подробности в smoke.json');
    }

    const stages = buildStages(start, max, step);
    for (const scenario of scenarios) {
      await requestJson(baseUrl, '/bench/reset', timeout);
      for (const users of stages) {
        const sampler = startSampler();
        const result = await runProcess(SCENARIO_RUNNER, [
          `--url=${baseUrl}`,
          `--scenario=${scenario}`,
          `--duration=${duration}`,
          `--timeout=${timeout}`,
          `--users=${users}`,
        ], { cwd: BACKEND_DIR });
        const system = sampler.stop();
        const health = await requestJson(baseUrl, '/health', timeout);
        const logName = `${scenario}_${users}.log`.replace(/[^A-Za-z0-9_.-]+/g, '_');
        fs.writeFileSync(path.join(logsDir, logName), `${result.stdout}\n${result.stderr}\n${result.error}`, 'utf8');

        const summary = result.ok ? parseScenarioSummary(result.stdout, users) : null;
        const total = summary?.total || 0;
        const failed = summary?.failed || (summary ? 0 : users);
        const errRatePct = total > 0 ? Math.round((failed / total) * 10000) / 100 : 100;
        const row = {
          scenario,
          users,
          summary,
          requests: total,
          ok: summary?.ok || 0,
          failed,
          errRatePct,
          rps: summary?.rps || 0,
          avgMs: Math.round(summary?.avgMs || 0),
          p95Ms: Math.round(summary?.p95Ms || 0),
          p99Ms: Math.round(summary?.p99Ms || 0),
          cpuAvgPct: system.cpuAvgPct,
          cpuMaxPct: system.cpuMaxPct,
          memAvailMinMb: system.memAvailMinMb,
          serverRssMb: health.body?.memoryMb?.rss ?? null,
          serverHeapMb: health.body?.memoryMb?.heapUsed ?? null,
          worstRoute: pickWorstRoute(summary?.routes || {}),
        };
        row.risk = riskLevel(row);
        rows.push(row);

        fs.writeFileSync(path.join(outputDir, 'suite.partial.json'), JSON.stringify(rows, null, 2), 'utf8');
        writeCsv(path.join(outputDir, 'suite.partial.csv'), rows);

        console.log(`[load-suite] ${scenario} users=${users} risk=${row.risk} p95=${row.p95Ms}ms errors=${row.errRatePct}%`);
        if (stopOnRisk && row.risk !== 'ok') break;
      }
    }
  } finally {
    server.kill();
    serverLog.end();
  }

  const finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(outputDir, 'suite.json'), JSON.stringify(rows, null, 2), 'utf8');
  writeCsv(path.join(outputDir, 'suite.csv'), rows);
  fs.writeFileSync(path.join(outputDir, 'summary.md'), buildSummaryMarkdown({
    rows,
    diagnostics,
    smoke,
    startedAt,
    finishedAt,
    outputDir,
  }), 'utf8');

  console.log(`[load-suite] отчет: ${outputDir}`);
}

main().catch((error) => {
  console.error('[load-suite] FAILED');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
