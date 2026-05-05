const { startServer, stopServer, getTokens } = require('./test-server');
const ScenarioRunner = require('./scenarios');
const MetricsCollector = require('./metrics');

async function quickTest() {
  console.log('[QUICK] Запуск быстрой проверки...');
  console.log('[QUICK] Создаём 50 юзеров, тестируем основные маршруты\n');

  const { port } = await startServer(50);
  const tokens = getTokens();
  const baseUrl = `http://localhost:${port}`;

  const scenario = new ScenarioRunner(baseUrl, tokens);
  const metrics = new MetricsCollector();
  metrics.start(500);

  let allOk = true;

  // Тест 1: Auth
  console.log('[QUICK] 1/8 Auth/me...');
  const authResults = await scenario.runAuthCheck(tokens.slice(0, 5));
  metrics.recordResults(authResults);
  const authOk = authResults.filter(r => r.ok).length;
  console.log(`  → ${authOk}/${authResults.length} ок`);

  // Тест 2: News
  console.log('[QUICK] 2/8 News...');
  const newsResults = await scenario.runNewsBrowse(tokens.slice(0, 5));
  metrics.recordResults(newsResults);
  const newsOk = newsResults.filter(r => r.ok).length;
  console.log(`  → ${newsOk}/${newsResults.length} ок`);

  // Тест 3: Battle
  console.log('[QUICK] 3/8 Battle...');
  const battleResults = await scenario.runBattleJoin(tokens.slice(0, 5));
  metrics.recordResults(battleResults);
  const battleOk = battleResults.filter(r => r.ok).length;
  console.log(`  → ${battleOk}/${battleResults.length} ок`);

  // Тест 4: Fortune
  console.log('[QUICK] 4/8 Fortune...');
  const fortuneResults = await scenario.runFortuneStatus(tokens.slice(0, 5));
  metrics.recordResults(fortuneResults);
  const fortuneOk = fortuneResults.filter(r => r.ok).length;
  console.log(`  → ${fortuneOk}/${fortuneResults.length} ок`);

  // Тест 5: Tree
  console.log('[QUICK] 5/8 Tree...');
  const treeResults = await scenario.runTreeStatus(tokens.slice(0, 5));
  metrics.recordResults(treeResults);
  const treeOk = treeResults.filter(r => r.ok).length;
  console.log(`  → ${treeOk}/${treeResults.length} ок`);

  // Тест 6: Crystal
  console.log('[QUICK] 6/8 Crystal...');
  const crystalResults = await scenario.runCrystalCollect(tokens.slice(0, 5));
  metrics.recordResults(crystalResults);
  const crystalOk = crystalResults.filter(r => r.ok).length;
  console.log(`  → ${crystalOk}/${crystalResults.length} ок`);

  // Тест 7: Sockets
  console.log('[QUICK] 7/8 Sockets (battle)...');
  const socketResults = await scenario.runSocketBattle(tokens.slice(0, 3), 3000);
  metrics.recordResults(socketResults);
  const socketOk = socketResults.filter(r => r.ok).length;
  console.log(`  → ${socketOk}/${socketResults.length} ок`);

  // Тест 8: Mixed
  console.log('[QUICK] 8/8 Mixed load (10 сек)...');
  const mixedResults = await scenario.runMixedLoad(tokens, 10);
  metrics.recordResults(mixedResults);
  const mixedOk = mixedResults.filter(r => r.ok).length;
  console.log(`  → ${mixedOk}/${mixedResults.length} ок`);

  metrics.stop();
  const summary = metrics.getSummary();

  console.log('\n[QUICK] ═══ РЕЗУЛЬТАТ БЫСТРОЙ ПРОВЕРКИ ═══');
  console.log(`Всего запросов: ${summary.totalRequests}`);
  console.log(`Успешных: ${summary.successCount} (${summary.overallSuccessRate}%)`);
  console.log(`Ошибок: ${summary.failCount}`);
  console.log(`Средняя задержка: ${summary.overallAvgMs} мс`);
  console.log(`Пик памяти: ${summary.peakMemoryMB} МБ`);

  if (summary.failCount > 0) {
    console.log('\nОшибки по маршрутам:');
    for (const [label, stats] of Object.entries(summary.labelStats)) {
      if (stats.failCount > 0) {
        console.log(`  ${label}: ${stats.failCount} ошибок`);
      }
    }
  }

  await stopServer();

  if (parseFloat(summary.overallSuccessRate) >= 90) {
    console.log('\n[QUICK] ✅ Всё работает! Можно запускать полный тест.');
  } else {
    console.log('\n[QUICK] ❌ Слишком много ошибок. Нужно разобраться.');
  }

  process.exit(0);
}

quickTest().catch(err => {
  console.error('[QUICK] FATAL:', err);
  process.exit(1);
});
