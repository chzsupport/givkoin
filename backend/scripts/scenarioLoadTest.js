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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function coerceBody(body) {
  if (body == null) return null;
  if (typeof body === 'string' || Buffer.isBuffer(body)) return body;
  return JSON.stringify(body);
}

function normalizeAction(action) {
  if (!action) return { method: 'GET', path: '/' };
  if (typeof action === 'string') return { method: 'GET', path: action };
  if (Array.isArray(action)) return normalizeAction(action[0]);
  const method = String(action.method || action.httpMethod || 'GET').toUpperCase();
  const path = String(action.path || action.url || '/');
  const body = action.body ?? null;
  const headers = action.headers && typeof action.headers === 'object' ? action.headers : null;
  return { method, path, body, headers };
}

function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))];
}

function requestOnce(target, timeoutMs, agent, action) {
  const lib = target.protocol === 'https:' ? https : http;
  const startedAt = process.hrtime.bigint();
  const method = String(action?.method || 'GET').toUpperCase();
  const body = coerceBody(action?.body);
  const headers = Object.assign({}, action?.headers || {});
  if (body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  if (body && !headers['Content-Length']) {
    headers['Content-Length'] = Buffer.byteLength(body);
  }
  return new Promise((resolve) => {
    const req = lib.request(target, { method, agent, timeout: timeoutMs, headers }, (res) => {
      res.on('data', () => {});
      res.on('end', () => {
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 400,
          statusCode: res.statusCode,
          durationMs: Number(process.hrtime.bigint() - startedAt) / 1e6,
        });
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (error) => {
      resolve({ ok: false, error: error.message || 'request_error', durationMs: Number(process.hrtime.bigint() - startedAt) / 1e6 });
    });
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

const FULL_PAGE_PATHS = [
  '/',
  '/confirm',
  '/roadmap',
  '/news',
  '/register',
  '/chronicle',
  '/practice',
  '/reset-password',
  '/login',
  '/galaxy',
  '/shop',
  '/ref/[username]',
  '/tree',
  '/practice/meditation/we',
  '/rules',
  '/practice/meditation',
  '/solar',
  '/battle',
  '/entity/profile',
  '/entity',
  '/practice/gratitude',
  '/about',
  '/fortune/roulette',
  '/fortune',
  '/entity/create',
  '/bridges',
  '/fortune/lottery',
  '/practice/meditation/me',
  '/evil-root',
  '/activity/night-shift',
  '/chat',
  '/activity/attendance',
  '/cabinet',
  '/activity/collect',
  '/cabinet/warehouse',
  '/forgot-password',
  '/cabinet/notifications',
  '/cabinet/activity',
  '/cabinet/news',
  '/chat/[chatId]',
  '/cabinet/settings',
  '/feedback',
  '/cabinet/referrals',
  '/cabinet/friends',
  '/cabinet/history',
  '/activity/achievements',
];

const HEAVY_ACTIONS = [
  '/bench/action/battle_full',
  '/bench/action/news_full',
  '/bench/action/chat_full',
  '/bench/action/night_shift',
  '/bench/action/meditation_collective',
  '/bench/action/meditation_individual',
  '/bench/action/crystal',
];

function buildPageActions() {
  return FULL_PAGE_PATHS.map((path) => [`/bench/page?path=${encodeURIComponent(path)}`, 1]);
}

function buildProjectUniformProfiles() {
  return [
    { name: 'pages', share: 75, thinkMin: 4000, thinkMax: 9000, actions: buildPageActions() },
    {
      name: 'light_actions',
      share: 25,
      thinkMin: 5000,
      thinkMax: 11000,
      actions: [
        ['/bench/action/news_full', 2],
        ['/bench/action/chat_full', 2],
        ['/bench/action/meditation_collective', 1],
        ['/bench/action/meditation_individual', 1],
        ['/bench/action/night_shift', 1],
        ['/bench/action/crystal', 1],
        ['/bench/action/battle_full', 1],
      ],
    },
  ];
}

function buildHeavyUniformProfiles() {
  return [
    { name: 'heavy', share: 100, thinkMin: 7000, thinkMax: 13000, actions: HEAVY_ACTIONS.map((path) => [path, 1]) },
  ];
}

const PROFILE_DEFS = {
  mixed: [
    { name: 'reader', share: 55, thinkMin: 6000, thinkMax: 16000, actions: [['/bench/news', 35], ['/bench/news/categories', 25], ['/bench/quotes/active', 20], ['/bench/ads/rotation', 10], ['/bench/ads/creative', 10]] },
    { name: 'browser', share: 30, thinkMin: 4000, thinkMax: 12000, actions: [['/bench/quotes/active', 30], ['/bench/news/categories', 25], ['/bench/ads/rotation', 25], ['/bench/ads/creative', 20]] },
    { name: 'fighter', share: 15, thinkMin: 15000, thinkMax: 30000, actions: [['/bench/battle/cycle', 80], ['/bench/quotes/active', 10], ['/bench/ads/creative', 10]] },
  ],
  browse: [
    { name: 'browser', share: 100, thinkMin: 4000, thinkMax: 12000, actions: [['/bench/quotes/active', 30], ['/bench/news/categories', 30], ['/bench/ads/rotation', 20], ['/bench/ads/creative', 20]] },
  ],
  news: [
    { name: 'reader', share: 100, thinkMin: 7000, thinkMax: 18000, actions: [['/bench/news', 65], ['/bench/news/categories', 20], ['/bench/quotes/active', 15]] },
  ],
  battle: [
    { name: 'fighter', share: 100, thinkMin: 15000, thinkMax: 30000, actions: [['/bench/battle/cycle', 90], ['/bench/quotes/active', 10]] },
  ],
  battle_only: [
    { name: 'fighter', share: 100, thinkMin: 9000, thinkMax: 14000, actions: [['/bench/action/battle_full', 100]] },
  ],
  news_only: [
    { name: 'reader', share: 100, thinkMin: 4500, thinkMax: 9000, actions: [['/bench/action/news_full', 70], ['/bench/news', 30]] },
  ],
  chat_only: [
    { name: 'chatter', share: 100, thinkMin: 3000, thinkMax: 7000, actions: [['/bench/action/chat_full', 70], ['/bench/action/chat_view', 30]] },
  ],
  crystal_only: [
    { name: 'crystal', share: 100, thinkMin: 5000, thinkMax: 9000, actions: [['/bench/action/crystal', 100]] },
  ],
  project_uniform: buildProjectUniformProfiles(),
  full_uniform: buildProjectUniformProfiles(),
  heavy_uniform: buildHeavyUniformProfiles(),
  battle_news_40_40_20: [
    { name: 'fighters', share: 40, thinkMin: 9000, thinkMax: 14000, actions: [['/bench/action/battle_full', 100]] },
    { name: 'newsers', share: 40, thinkMin: 4500, thinkMax: 9000, actions: [['/bench/action/news_full', 70], ['/bench/news', 30]] },
    { name: 'mixed', share: 20, thinkMin: 6000, thinkMax: 14000, actions: buildPageActions() },
  ],
  social_mix: [
    { name: 'chatters', share: 50, thinkMin: 3000, thinkMax: 7000, actions: [['/bench/action/chat_full', 75], ['/bench/action/chat_view', 25]] },
    { name: 'newsers', share: 25, thinkMin: 4500, thinkMax: 9000, actions: [['/bench/action/news_full', 70], ['/bench/news', 30]] },
    { name: 'fighters', share: 25, thinkMin: 9000, thinkMax: 14000, actions: [['/bench/action/battle_full', 100]] },
  ],
  all_in_one: [
    { name: 'pileup', share: 100, thinkMin: 9000, thinkMax: 15000, actions: [['/bench/action/battle_full', 100]] },
  ],
  collective_meditation_focus: [
    { name: 'collective', share: 60, thinkMin: 8000, thinkMax: 12000, actions: [['/bench/action/meditation_collective', 100]] },
    { name: 'individual', share: 15, thinkMin: 2500, thinkMax: 5000, actions: [['/bench/action/meditation_individual', 100]] },
    { name: 'crystal', share: 15, thinkMin: 5000, thinkMax: 9000, actions: [['/bench/action/crystal', 100]] },
    {
      name: 'practice_pages',
      share: 10,
      thinkMin: 5000,
      thinkMax: 9000,
      actions: [
        ['/bench/page?path=%2Fpractice', 1],
        ['/bench/page?path=%2Fpractice%2Fmeditation', 1],
        ['/bench/page?path=%2Fpractice%2Fmeditation%2Fwe', 1],
      ],
    },
  ],
  night_shift_crystal_focus: [
    { name: 'night_shift', share: 50, thinkMin: 7000, thinkMax: 12000, actions: [['/bench/action/night_shift', 100]] },
    { name: 'crystal', share: 35, thinkMin: 5000, thinkMax: 9000, actions: [['/bench/action/crystal', 100]] },
    {
      name: 'support_pages',
      share: 15,
      thinkMin: 5000,
      thinkMax: 9000,
      actions: [
        ['/bench/page?path=%2Factivity', 1],
        ['/bench/page?path=%2Factivity%2Fnight-shift', 1],
        ['/bench/page?path=%2Factivity%2Fcollect', 1],
        ['/bench/page?path=%2Fcabinet', 1],
        ['/bench/page?path=%2Fcabinet%2Factivity', 1],
      ],
    },
  ],
  night_shift_only: [
    { name: 'night_shift', share: 100, thinkMin: 7000, thinkMax: 12000, actions: [['/bench/action/night_shift', 100]] },
  ],
  night_shift_plus_crystal: [
    { name: 'night_shift', share: 50, thinkMin: 7000, thinkMax: 12000, actions: [['/bench/action/night_shift', 100]] },
    { name: 'crystal', share: 50, thinkMin: 5000, thinkMax: 9000, actions: [['/bench/action/crystal', 100]] },
  ],
  community_mix: [
    { name: 'newsers', share: 20, thinkMin: 4500, thinkMax: 9000, actions: [['/bench/action/news_full', 100]] },
    { name: 'chatters', share: 20, thinkMin: 3000, thinkMax: 7000, actions: [['/bench/action/chat_full', 100]] },
    { name: 'collective', share: 20, thinkMin: 8000, thinkMax: 12000, actions: [['/bench/action/meditation_collective', 100]] },
    { name: 'fighters', share: 20, thinkMin: 9000, thinkMax: 14000, actions: [['/bench/action/battle_full', 100]] },
    { name: 'night_shift', share: 10, thinkMin: 7000, thinkMax: 12000, actions: [['/bench/action/night_shift', 100]] },
    { name: 'crystal', share: 10, thinkMin: 5000, thinkMax: 9000, actions: [['/bench/action/crystal', 100]] },
  ],
  peak_event_mix: [
    { name: 'collective', share: 35, thinkMin: 8000, thinkMax: 12000, actions: [['/bench/action/meditation_collective', 100]] },
    { name: 'newsers', share: 20, thinkMin: 4500, thinkMax: 9000, actions: [['/bench/action/news_full', 100]] },
    { name: 'fighters', share: 20, thinkMin: 9000, thinkMax: 14000, actions: [['/bench/action/battle_full', 100]] },
    { name: 'chatters', share: 15, thinkMin: 3000, thinkMax: 7000, actions: [['/bench/action/chat_full', 100]] },
    { name: 'night_shift', share: 10, thinkMin: 7000, thinkMax: 12000, actions: [['/bench/action/night_shift', 100]] },
  ],
};

function pickWeighted(items) {
  const total = items.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = Math.random() * total;
  for (const item of items) {
    roll -= item[1];
    if (roll <= 0) return item[0];
  }
  return items[items.length - 1][0];
}

function buildUsers(count, profileDefs) {
  const users = [];
  let created = 0;
  profileDefs.forEach((profile, index) => {
    const left = count - created;
    const size = index === profileDefs.length - 1 ? left : Math.round((count * profile.share) / 100);
    for (let i = 0; i < size && users.length < count; i += 1) users.push(profile);
    created = users.length;
  });
  return users;
}

async function fetchHealth(baseUrl, timeoutMs) {
  const target = new URL('/health', baseUrl);
  const result = await new Promise((resolve) => {
    const lib = target.protocol === 'https:' ? https : http;
    const req = lib.request(target, { method: 'GET', timeout: timeoutMs }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk.toString(); });
      res.on('end', () => resolve({ ok: true, body }));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (error) => resolve({ ok: false, error: error.message || 'health_error' }));
    req.end();
  });
  if (!result.ok) return { ok: false, error: result.error };
  try {
    return { ok: true, data: JSON.parse(result.body) };
  } catch {
    return { ok: false, error: 'bad_health_json' };
  }
}

async function runStage({ baseUrl, stageUsers, durationSeconds, timeoutMs, scenario }) {
  const profiles = PROFILE_DEFS[scenario] || PROFILE_DEFS.mixed;
  const users = buildUsers(stageUsers, profiles);
  const endAt = Date.now() + durationSeconds * 1000;
  const agent = baseUrl.protocol === 'https:' ? new https.Agent({ keepAlive: true, maxSockets: stageUsers }) : new http.Agent({ keepAlive: true, maxSockets: stageUsers });
  const routes = new Map();
  const durations = [];
  let ok = 0;
  let failed = 0;

  async function virtualUser(profile) {
    await sleep(randomInt(0, Math.min(profile.thinkMax, 5000)));
    while (Date.now() < endAt) {
      const action = normalizeAction(pickWeighted(profile.actions));
      const path = action.path;
      const method = action.method || 'GET';
      const routeKey = `${method} ${path}`;
      const result = await requestOnce(new URL(path, baseUrl), timeoutMs, agent, action);
      const bucket = routes.get(routeKey) || { total: 0, ok: 0, failed: 0 };
      bucket.total += 1;
      if (result.ok) {
        bucket.ok += 1;
        ok += 1;
      } else {
        bucket.failed += 1;
        failed += 1;
      }
      routes.set(routeKey, bucket);
      durations.push(result.durationMs);
      await sleep(randomInt(profile.thinkMin, profile.thinkMax));
    }
  }

  await Promise.all(users.map((profile) => virtualUser(profile)));
  agent.destroy();
  const total = ok + failed;
  const health = await fetchHealth(baseUrl, timeoutMs);
  return {
    users: stageUsers,
    total,
    ok,
    failed,
    rps: total / durationSeconds,
    avg: durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : 0,
    p95: percentile(durations, 0.95),
    p99: percentile(durations, 0.99),
    routes: Object.fromEntries(routes),
    health,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = new URL(String(args.url || 'http://127.0.0.1:10000'));
  const scenario = String(args.scenario || 'mixed');
  const durationSeconds = Math.max(10, Number(args.duration || 30));
  const timeoutMs = Math.max(500, Number(args.timeout || 8000));
  const stages = String(args.users || '100,500,1000,2000').split(',').map((value) => Number(value.trim())).filter(Boolean);

  console.log(`[scenario-test] base=${baseUrl.href} scenario=${scenario} duration=${durationSeconds}s timeout=${timeoutMs}ms`);
  console.log(`[scenario-test] users=${stages.join(', ')}`);
  for (const stageUsers of stages) {
    console.log(`\n[scenario-test] stage users=${stageUsers} started`);
    const summary = await runStage({ baseUrl, stageUsers, durationSeconds, timeoutMs, scenario });
    console.log(`[scenario-test] stage users=${stageUsers} done total=${summary.total} ok=${summary.ok} failed=${summary.failed} rps=${summary.rps.toFixed(2)} avg=${Math.round(summary.avg)}ms p95=${Math.round(summary.p95)}ms p99=${Math.round(summary.p99)}ms`);
    console.log(`[scenario-test] routes=${JSON.stringify(summary.routes)}`);
    console.log(`[scenario-test] health=${JSON.stringify(summary.health)}`);
  }
}

main().catch((error) => {
  console.error('[scenario-test] FAILED');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
