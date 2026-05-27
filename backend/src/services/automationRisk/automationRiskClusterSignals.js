const {
  addSignal,
  clamp,
  cosineSimilarity,
  jaccardSimilarity,
  round,
} = require('./automationRiskScoring');

function evaluateStructuralClusterSignals(contextsByUserId, progressProfilesByUser, battleProfilesByUser) {
  for (const [userId, ctx] of contextsByUserId.entries()) {
    const relatedIds = Array.from(ctx.relatedUsers);
    if (!relatedIds.length) continue;

    const ownProgress = progressProfilesByUser.get(userId);
    if (ownProgress) {
      const progressMatches = [];
      const achievementMatches = [];

      for (const relatedId of relatedIds) {
        const relatedProgress = progressProfilesByUser.get(relatedId);
        if (!relatedProgress) continue;

        const structureSimilarity = cosineSimilarity(ownProgress.structureVector, relatedProgress.structureVector);
        const earningsSimilarity = cosineSimilarity(ownProgress.earningsVector, relatedProgress.earningsVector);
        const scaleSimilarity = cosineSimilarity(ownProgress.scaleVector, relatedProgress.scaleVector);
        if (structureSimilarity >= 0.985 && earningsSimilarity >= 0.97 && scaleSimilarity >= 0.985) {
          progressMatches.push({
            userId: relatedId,
            structureSimilarity,
            earningsSimilarity,
            scaleSimilarity,
          });
        }

        const achievementSimilarity = jaccardSimilarity(ownProgress.achievementIds, relatedProgress.achievementIds);
        if (
          ownProgress.achievementIds.size >= 4
          && relatedProgress.achievementIds.size >= 4
          && achievementSimilarity >= 0.85
        ) {
          achievementMatches.push({
            userId: relatedId,
            achievementSimilarity,
          });
        }
      }

      if (progressMatches.length) {
        addSignal(ctx, {
          signal: 'progress_structure_cluster',
          score: clamp(10 + progressMatches.length * 4, 10, 24),
          category: 'cluster',
          summary: 'Связанные аккаунты имеют слишком похожую структуру прогресса и заработка',
          happenedAt: new Date(),
          relatedUsers: progressMatches.map((row) => row.userId),
          meta: {
            matches: progressMatches.map((row) => ({
              userId: row.userId,
              structureSimilarity: round(row.structureSimilarity, 4),
              earningsSimilarity: round(row.earningsSimilarity, 4),
              scaleSimilarity: round(row.scaleSimilarity, 4),
            })),
          },
        });
      }

      if (achievementMatches.length) {
        addSignal(ctx, {
          signal: 'achievement_structure_cluster',
          score: clamp(8 + achievementMatches.length * 3, 8, 20),
          category: 'cluster',
          summary: 'У связанных аккаунтов слишком похожие наборы достижений',
          happenedAt: new Date(),
          relatedUsers: achievementMatches.map((row) => row.userId),
          meta: {
            matches: achievementMatches.map((row) => ({
              userId: row.userId,
              achievementSimilarity: round(row.achievementSimilarity, 4),
            })),
          },
        });
      }
    }

    const ownBattle = battleProfilesByUser.get(userId);
    if (ownBattle && ownBattle.shots >= 120) {
      const battleMatches = [];
      for (const relatedId of relatedIds) {
        const relatedBattle = battleProfilesByUser.get(relatedId);
        if (!relatedBattle || relatedBattle.shots < 120) continue;

        const closeMetrics = [
          Math.abs(ownBattle.staticRatio - relatedBattle.staticRatio) <= 0.08,
          Math.abs(ownBattle.intervalCv - relatedBattle.intervalCv) <= 0.03,
          Math.abs(ownBattle.hiddenRatio - relatedBattle.hiddenRatio) <= 0.03,
          Math.abs(ownBattle.screenWidth - relatedBattle.screenWidth) <= 0.08,
          Math.abs(ownBattle.screenHeight - relatedBattle.screenHeight) <= 0.08,
          Math.abs(ownBattle.avgCursorDistancePx - relatedBattle.avgCursorDistancePx) <= 20,
        ].filter(Boolean).length;

        if (closeMetrics >= 4) {
          battleMatches.push({
            userId: relatedId,
            closeMetrics,
            staticDiff: Math.abs(ownBattle.staticRatio - relatedBattle.staticRatio),
            intervalDiff: Math.abs(ownBattle.intervalCv - relatedBattle.intervalCv),
          });
        }
      }

      if (battleMatches.length) {
        addSignal(ctx, {
          signal: 'battle_signature_cluster',
          score: clamp(10 + battleMatches.length * 4, 10, 24),
          category: 'cluster',
          summary: 'Связанные аккаунты показывают слишком похожую боевую сигнатуру',
          happenedAt: new Date(),
          relatedUsers: battleMatches.map((row) => row.userId),
          meta: {
            matches: battleMatches.map((row) => ({
              userId: row.userId,
              closeMetrics: row.closeMetrics,
              staticDiff: round(row.staticDiff, 4),
              intervalDiff: round(row.intervalDiff, 4),
            })),
          },
        });
      }
    }
  }
}

function evaluateBehaviorClusterSignals(contextsByUserId) {
  for (const ctx of contextsByUserId.values()) {
    const relatedIds = Array.from(ctx.relatedUsers);
    if (!relatedIds.length) continue;

    if (ctx.summary.directNavigationSignature && ctx.summary.directTargetViews >= 8) {
      const matches = relatedIds.filter((id) => {
        const relatedCtx = contextsByUserId.get(id);
        return relatedCtx && relatedCtx.summary.directNavigationSignature === ctx.summary.directNavigationSignature;
      });
      if (matches.length) {
        addSignal(ctx, {
          signal: 'navigation_pattern_cluster',
          score: clamp(8 + matches.length * 4, 8, 20),
          category: 'cluster',
          summary: 'Связанные аккаунты используют одинаковый паттерн direct-link навигации',
          happenedAt: new Date(),
          relatedUsers: matches,
          meta: {
            signature: ctx.summary.directNavigationSignature,
            matchedUsers: matches.length,
          },
        });
      }
    }

    if (ctx.summary.profitRoutineSignature && ctx.summary.profitableActions >= 8) {
      const matches = relatedIds.filter((id) => {
        const relatedCtx = contextsByUserId.get(id);
        return relatedCtx && relatedCtx.summary.profitRoutineSignature === ctx.summary.profitRoutineSignature;
      });
      if (matches.length) {
        addSignal(ctx, {
          signal: 'profit_schedule_cluster',
          score: clamp(8 + matches.length * 3, 8, 18),
          category: 'cluster',
          summary: 'Связанные аккаунты фармят по слишком похожему расписанию',
          happenedAt: new Date(),
          relatedUsers: matches,
          meta: {
            signature: ctx.summary.profitRoutineSignature,
            matchedUsers: matches.length,
          },
        });
      }
    }
  }
}

module.exports = {
  evaluateBehaviorClusterSignals,
  evaluateStructuralClusterSignals,
};
