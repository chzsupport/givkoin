const fs = require('fs');
const path = require('path');
const { startServer, stopServer, getTokens, issueToken } = require('./test-server');
const ScenarioRunner = require('./scenarios');
const MetricsCollector = require('./metrics');

const STAGES = [500, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000];
const MIXED_DURATION_SEC = 30;
const FOCUSED_ROUNDS = 3;
const RESULTS_DIR = path.resolve(__dirname, 'results');

const FOCUSED_SCENARIOS = [
  'auth',
  'news',
  'battle',
  'fortune',
  'bridges',
  'tree',
  'crystal',
  'streak',
  'nightshift',
  'meditation',
  'shop',
  'evilroot',
  'gratitude',
  'sockets_battle',
  'sockets_chat',
];

function ensureResultsDir() {
  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runStage(userCount) {
  log(`\n${'='.repeat(60)}`);
  log(`СТАРТ ЭТАПА: ${userCount} юзеров`);
  log(`${'='.repeat(60)}`);

  const serverInfo = await startServer(userCount);
  const tokens = getTokens();
  const baseUrl = `http://localhost:${serverInfo.port}`;

  const scenario = new ScenarioRunner(baseUrl, tokens);
  const metrics = new MetricsCollector();

  await sleep(1000);

  // === ФАЗА 1: Смешанная нагрузка (имитация реального трафика) ===
  log(`ФАЗА 1: Смешанная нагрузка — ${MIXED_DURATION_SEC} сек, ${userCount} юзеров`);
  metrics.start(1000);

  const mixedResults = await scenario.runMixedLoad(tokens, MIXED_DURATION_SEC);
  metrics.recordResults(mixedResults);

  log(`Смешанная нагрузка завершена: ${mixedResults.length} запросов`);
  await sleep(2000);

  // === ФАЗА 2: Фокусный тест каждой механики ===
  log(`ФАЗА 2: Фокусные тесты по каждой механике`);

  for (const scenarioName of FOCUSED_SCENARIOS) {
    log(`  → ${scenarioName}...`);
    try {
      const results = await scenario.runFocusedTest(scenarioName, tokens, FOCUSED_ROUNDS);
      metrics.recordResults(results);
      const ok = results.filter(r => r.ok).length;
      const fail = results.filter(r => !r.ok).length;
      log(`    ${scenarioName}: ${ok} ок, ${fail} ошибок`);
    } catch (err) {
      log(`    ${scenarioName}: ОШИБКА — ${err.message}`);
      metrics.recordResults([{ label: scenarioName, duration: 0, ok: false, status: 0, error: err.message }]);
    }
    await sleep(500);
  }

  metrics.stop();

  const summary = metrics.getSummary();
  summary.userCount = userCount;
  summary.stage = `stage_${userCount}`;

  // Сохраняем результаты
  const resultFile = path.join(RESULTS_DIR, `stage_${userCount}.json`);
  fs.writeFileSync(resultFile, JSON.stringify(summary, null, 2), 'utf8');
  log(`Результаты сохранены: ${resultFile}`);

  // Краткий вывод
  log(`\n--- ИТОГИ ЭТАПА ${userCount} юзеров ---`);
  log(`Всего запросов: ${summary.totalRequests}`);
  log(`Успешных: ${summary.successCount} (${summary.overallSuccessRate}%)`);
  log(`Ошибок: ${summary.failCount}`);
  log(`Средняя задержка: ${summary.overallAvgMs} мс`);
  log(`P50: ${summary.overallP50Ms} мс | P95: ${summary.overallP95Ms} мс | P99: ${summary.overallP99Ms} мс`);
  log(`Пик памяти (heap): ${summary.peakMemoryMB} МБ`);
  log(`Пик памяти (RSS): ${summary.peakRssMB} МБ`);
  log(`Система RAM: ${summary.systemUsedMemPercent}% занято`);
  log(`Система Load: ${summary.systemLoadAvg1} / ${summary.systemLoadAvg5}`);
  log(`---\n`);

  await stopServer();
  await sleep(3000);

  return summary;
}

async function runAll() {
  ensureResultsDir();

  log('GIVKOIN — НАГРУЗОЧНЫЙ ТЕСТ');
  log(`Этапы: ${STAGES.join(' → ')} юзеров`);
  log(`Начало: ${new Date().toISOString()}\n`);

  const allSummaries = [];
  const pcInfo = {
    cpuCount: require('os').cpus().length,
    cpuModel: require('os').cpus()[0]?.model || 'unknown',
    totalMemGB: (require('os').totalmem() / 1024 / 1024 / 1024).toFixed(1),
    platform: require('os').platform(),
    arch: require('os').arch(),
  };
  log(`ПК: ${pcInfo.cpuModel} x${pcInfo.cpuCount}, RAM ${pcInfo.totalMemGB} ГБ, ${pcInfo.platform}/${pcInfo.arch}\n`);

  for (const userCount of STAGES) {
    try {
      const summary = await runStage(userCount);
      allSummaries.push(summary);
    } catch (err) {
      log(`ЭТАП ${userCount} ПРОВАЛЕН: ${err.message}`);
      allSummaries.push({
        userCount,
        stage: `stage_${userCount}`,
        error: err.message,
        failed: true,
      });

      try { await stopServer(); } catch (_) {}
      await sleep(5000);
    }
  }

  // Генерация финального отчёта
  const report = generateReport(allSummaries, pcInfo);
  const reportFile = path.join(RESULTS_DIR, 'final-report.json');
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2), 'utf8');

  const textReport = generateTextReport(report);
  const textFile = path.join(RESULTS_DIR, 'final-report.txt');
  fs.writeFileSync(textFile, textReport, 'utf8');

  log(`\nФИНАЛЬНЫЙ ОТЧЁТ:`);
  log(textReport);
  log(`\nСохранено: ${reportFile} и ${textFile}`);
}

function generateReport(summaries, pcInfo) {
  const successfulStages = summaries.filter(s => !s.failed);
  const failedStages = summaries.filter(s => s.failed);

  const breakdown = [];
  for (const s of successfulStages) {
    const labelStats = s.labelStats || {};
    const heaviest = Object.entries(labelStats)
      .sort(([, a], [, b]) => b.avgMs - a.avgMs)
      .slice(0, 5)
      .map(([label, stats]) => ({ label, ...stats }));

    const mostErrors = Object.entries(labelStats)
      .filter(([, stats]) => stats.failCount > 0)
      .sort(([, a], [, b]) => b.failCount - a.failCount)
      .slice(0, 5)
      .map(([label, stats]) => ({ label, failCount: stats.failCount, successRate: stats.successRate }));

    breakdown.push({
      userCount: s.userCount,
      totalRequests: s.totalRequests,
      successRate: s.overallSuccessRate,
      avgMs: s.overallAvgMs,
      p50Ms: s.overallP50Ms,
      p95Ms: s.overallP95Ms,
      p99Ms: s.overallP99Ms,
      peakMemoryMB: s.peakMemoryMB,
      peakRssMB: s.peakRssMB,
      systemUsedMemPercent: s.systemUsedMemPercent,
      systemLoadAvg1: s.systemLoadAvg1,
      heaviest,
      mostErrors,
    });
  }

  const maxStableUsers = findMaxStableUsers(successfulStages);

  const allLabelStats = {};
  for (const s of successfulStages) {
    for (const [label, stats] of Object.entries(s.labelStats || {})) {
      if (!allLabelStats[label]) allLabelStats[label] = [];
      allLabelStats[label].push({ userCount: s.userCount, ...stats });
    }
  }

  const mechanicsRanking = rankMechanics(allLabelStats);

  return {
    pcInfo,
    testDate: new Date().toISOString(),
    maxStableUsers,
    failedAtUsers: failedStages.length > 0 ? failedStages[0].userCount : null,
    stages: breakdown,
    mechanicsRanking,
    allLabelStats,
    vpsEstimate: {
      note: 'VPS в 3 раза мощнее ПК. Реальная ёмкость будет выше.',
      estimatedMaxUsers: maxStableUsers ? maxStableUsers * 2.5 : 'не определено',
      estimatedMaxUsersConservative: maxStableUsers ? maxStableUsers * 2 : 'не определено',
    },
  };
}

function findMaxStableUsers(stages) {
  const sorted = [...stages].sort((a, b) => a.userCount - b.userCount);
  let maxStable = 0;
  for (const s of sorted) {
    const rate = parseFloat(s.overallSuccessRate || '0');
    const avgMs = s.overallAvgMs || 9999;
    if (rate >= 95 && avgMs < 3000) {
      maxStable = s.userCount;
    }
  }
  return maxStable;
}

function rankMechanics(allLabelStats) {
  const ranking = [];
  for (const [label, entries] of Object.entries(allLabelStats)) {
    const highLoad = entries.filter(e => e.userCount >= 2000);
    const data = highLoad.length > 0 ? highLoad : entries;
    const avgMs = data.reduce((s, e) => s + (e.avgMs || 0), 0) / data.length;
    const avgFailRate = data.reduce((s, e) => s + (100 - parseFloat(e.successRate || '100')), 0) / data.length;
    const score = avgMs + avgFailRate * 50;
    ranking.push({ label, avgMs: Math.round(avgMs), avgFailRate: avgFailRate.toFixed(1), score: Math.round(score) });
  }
  ranking.sort((a, b) => b.score - a.score);
  return ranking;
}

function generateTextReport(report) {
  const lines = [];
  lines.push('╔══════════════════════════════════════════════════════════╗');
  lines.push('║        GIVKOIN — ОТЧЁТ НАГРУЗОЧНОГО ТЕСТА               ║');
  lines.push('╚══════════════════════════════════════════════════════════╝');
  lines.push('');
  lines.push(`Дата: ${report.testDate}`);
  lines.push(`ПК: ${report.pcInfo.cpuModel} x${report.pcInfo.cpuCount} ядер`);
  lines.push(`RAM: ${report.pcInfo.totalMemGB} ГБ | ${report.pcInfo.platform}/${report.pcInfo.arch}`);
  lines.push('');

  lines.push('── РЕЗУЛЬТАТ ──────────────────────────────────────────────');
  if (report.maxStableUsers > 0) {
    lines.push(`Максимум стабильной работы: ${report.maxStableUsers} юзеров`);
  } else {
    lines.push(`Максимум стабильной работы: НЕ ОПРЕДЕЛЕНО (все этапы с ошибками)`);
  }
  if (report.failedAtUsers) {
    lines.push(`Первый сбой при: ${report.failedAtUsers} юзерах`);
  }
  lines.push(`Прогноз для VPS (x3 мощнее): ~${report.vpsEstimate.estimatedMaxUsers} юзеров`);
  lines.push(`Прогноз консервативный (x2): ~${report.vpsEstimate.estimatedMaxUsersConservative} юзеров`);
  lines.push('');

  lines.push('── ЭТАПЫ ─────────────────────────────────────────────────');
  for (const s of report.stages) {
    lines.push(`  ${String(s.userCount).padStart(5)} юзеров | ` +
      `успех ${String(s.successRate).padStart(5)}% | ` +
      `среднее ${String(s.avgMs).padStart(5)} мс | ` +
      `P95 ${String(s.p95Ms).padStart(5)} мс | ` +
      `память ${String(s.peakMemoryMB).padStart(4)} МБ | ` +
      `RSS ${String(s.peakRssMB).padStart(4)} МБ | ` +
      `RAM ${String(s.systemUsedMemPercent).padStart(5)}% | ` +
      `Load ${String(s.systemLoadAvg1).padStart(4)}`);
    if (s.heaviest && s.heaviest.length > 0) {
      lines.push(`           Тяжелейшие: ${s.heaviest.map(h => `${h.label}(${h.avgMs}мс)`).join(', ')}`);
    }
    if (s.mostErrors && s.mostErrors.length > 0) {
      lines.push(`           Больше ошибок: ${s.mostErrors.map(e => `${e.label}(${e.failCount}ош)`).join(', ')}`);
    }
  }
  lines.push('');

  lines.push('── РЕЙТИНГ МЕХАНИК (от самой тяжёлой к лёгкой) ──────────');
  for (const m of report.mechanicsRanking) {
    const bar = '█'.repeat(Math.min(50, Math.round(m.score / 20)));
    lines.push(`  ${m.label.padEnd(25)} | среднее ${String(m.avgMs).padStart(5)} мс | ошибки ${m.avgFailRate.padStart(5)}% | ${bar}`);
  }
  lines.push('');

  lines.push('── ЗАКЛЮЧЕНИЕ ────────────────────────────────────────────');
  if (report.maxStableUsers > 0) {
    lines.push(`Твой ПК выдерживает ${report.maxStableUsers} реальных юзеров без проблем.`);
    lines.push(`VPS (в 3 раза мощнее) сможет держать ~${report.vpsEstimate.estimatedMaxUsers} юзеров.`);
  } else {
    lines.push(`Тест не смог определить стабильный максимум. Нужно проверить ошибки.`);
  }
  if (report.mechanicsRanking.length > 0) {
    const heaviest = report.mechanicsRanking[0];
    lines.push(`Самая тяжёлая механика: ${heaviest.label} (среднее ${heaviest.avgMs} мс)`);
    lines.push(`Именно её нужно оптимизировать в первую очередь.`);
  }
  lines.push('');
  lines.push('═══════════════════════════════════════════════════════════');

  return lines.join('\n');
}

if (require.main === module) {
  runAll().catch(err => {
    console.error('FATAL:', err);
    process.exit(1);
  });
}

module.exports = { runAll, runStage, STAGES };
