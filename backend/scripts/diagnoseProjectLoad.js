const fs = require('fs');
const path = require('path');

function walkFiles(dir, predicate) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkFiles(full, predicate));
    } else if (!predicate || predicate(full)) {
      out.push(full);
    }
  }
  return out;
}

function toRouteFromPage(file, appRoot) {
  const rel = path.relative(appRoot, path.dirname(file));
  if (!rel || rel === '.') return '/';
  const parts = rel.split(path.sep).filter(Boolean);
  return `/${parts.join('/')}`;
}

function extractApiCalls(content) {
  const calls = [];
  const regex = /api(Get|Post|Put|Patch|Delete)\s*\(\s*(['"`])([^'"`]+)\2/g;
  let match;
  while ((match = regex.exec(content))) {
    const method = match[1].toUpperCase();
    const endpoint = match[3];
    calls.push({ method, endpoint });
  }
  return calls;
}

function collectFrontendPages(rootDir) {
  const appRoot = path.join(rootDir, 'frontend', 'src', 'app');
  const pages = walkFiles(appRoot, (file) => file.endsWith('page.tsx'));
  const pageList = [];
  const pageApiMap = {};
  for (const file of pages) {
    const route = toRouteFromPage(file, appRoot);
    pageList.push(route);
    const content = fs.readFileSync(file, 'utf8');
    const calls = extractApiCalls(content);
    if (calls.length) pageApiMap[route] = calls;
  }
  pageList.sort();
  return { pages: pageList, pageApiMap };
}

function parseRouteControllers(routeContent, routeDir) {
  const varToController = new Map();
  const requireRegex = /const\s+([A-Za-z0-9_]+)\s*=\s*require\(['"](\.\.\/controllers\/[^'"]+)['"]\)/g;
  let match;
  while ((match = requireRegex.exec(routeContent))) {
    varToController.set(match[1], path.resolve(routeDir, `${match[2]}.js`));
  }
  const destructureRegex = /const\s+\{([^}]+)\}\s*=\s*require\(['"](\.\.\/controllers\/[^'"]+)['"]\)/g;
  while ((match = destructureRegex.exec(routeContent))) {
    const names = match[1]
      .split(',')
      .map((part) => part.trim().split(/\s+as\s+/i)[0])
      .filter(Boolean);
    const filePath = path.resolve(routeDir, `${match[2]}.js`);
    names.forEach((name) => varToController.set(name, filePath));
  }
  return varToController;
}

function parseEndpoints(routeFile) {
  const routeDir = path.dirname(routeFile);
  const content = fs.readFileSync(routeFile, 'utf8');
  const controllers = parseRouteControllers(content, routeDir);
  const endpoints = [];
  const lines = content.split(/\r?\n/);
  const routeRegex = /router\.(get|post|put|patch|delete)\s*\(\s*(['"`])([^'"`]+)\2\s*,(.*)\)/i;
  for (const line of lines) {
    const match = line.match(routeRegex);
    if (!match) continue;
    const method = match[1].toUpperCase();
    const pathPart = match[3];
    const args = match[4] || '';
    const parts = args.split(',').map((part) => part.trim()).filter(Boolean);
    const handlerToken = parts[parts.length - 1] || '';
    let controllerFile = null;
    let handler = handlerToken;
    if (handlerToken.includes('.')) {
      const [varName] = handlerToken.split('.');
      controllerFile = controllers.get(varName) || null;
    } else if (controllers.has(handlerToken)) {
      controllerFile = controllers.get(handlerToken);
    }
    endpoints.push({
      method,
      path: pathPart,
      handler: handler,
      controllerFile,
      routeFile,
    });
  }
  return endpoints;
}

function scoreControllerFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return { dbOps: 0, loops: 0, score: 0 };
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const dbOps = (content.match(/\.from\s*\(/g) || []).length;
  const loops = (content.match(/\bfor\s*\(|\bwhile\s*\(/g) || []).length;
  const score = dbOps * 2 + loops;
  return { dbOps, loops, score };
}

function collectBackendEndpoints(rootDir) {
  const routeDir = path.join(rootDir, 'backend', 'src', 'routes');
  const routeFiles = walkFiles(routeDir, (file) => file.endsWith('.js'));
  const endpoints = [];
  const scoreCache = new Map();
  for (const file of routeFiles) {
    const rows = parseEndpoints(file);
    for (const row of rows) {
      if (row.controllerFile && !scoreCache.has(row.controllerFile)) {
        scoreCache.set(row.controllerFile, scoreControllerFile(row.controllerFile));
      }
      const scoreInfo = row.controllerFile ? scoreCache.get(row.controllerFile) : { dbOps: 0, loops: 0, score: 0 };
      const score = scoreInfo.score;
      const category = score >= 8 ? 'heavy' : score >= 4 ? 'medium' : 'light';
      endpoints.push({
        ...row,
        score,
        dbOps: scoreInfo.dbOps,
        loops: scoreInfo.loops,
        category,
      });
    }
  }
  return endpoints;
}

function summarize(endpoints) {
  const summary = { heavy: 0, medium: 0, light: 0 };
  endpoints.forEach((row) => {
    summary[row.category] = (summary[row.category] || 0) + 1;
  });
  return summary;
}

function collectDiagnostics(rootDir) {
  const frontend = collectFrontendPages(rootDir);
  const backendEndpoints = collectBackendEndpoints(rootDir);
  return {
    generatedAt: new Date().toISOString(),
    pages: frontend.pages,
    pageApiMap: frontend.pageApiMap,
    backendEndpoints,
    endpointSummary: summarize(backendEndpoints),
  };
}

function printTextReport(report) {
  console.log(`[diagnose] pages: ${report.pages.length}`);
  console.log(`[diagnose] backend endpoints: ${report.backendEndpoints.length}`);
  console.log(`[diagnose] heavy: ${report.endpointSummary.heavy} medium: ${report.endpointSummary.medium} light: ${report.endpointSummary.light}`);
  const top = [...report.backendEndpoints]
    .sort((a, b) => b.score - a.score)
    .slice(0, 15);
  console.log('[diagnose] top endpoints by score:');
  top.forEach((row) => {
    console.log(`  ${row.method} ${row.path} score=${row.score} (${row.category})`);
  });
}

if (require.main === module) {
  const rootDir = path.resolve(__dirname, '..', '..');
  const args = process.argv.slice(2);
  const wantJson = args.includes('--json');
  const outIndex = args.indexOf('--out');
  const outPath = outIndex >= 0 ? args[outIndex + 1] : null;
  const report = collectDiagnostics(rootDir);
  if (wantJson) {
    const payload = JSON.stringify(report, null, 2);
    if (outPath) {
      fs.writeFileSync(outPath, payload);
    } else {
      console.log(payload);
    }
  } else {
    printTextReport(report);
    if (outPath) {
      fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    }
  }
}

module.exports = {
  collectDiagnostics,
};
