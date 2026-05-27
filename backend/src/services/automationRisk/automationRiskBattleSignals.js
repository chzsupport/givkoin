const {
  addSignal,
  clamp,
  coefficientFromMoments,
  round,
  sortByDate,
} = require('./automationRiskScoring');

function evaluateBattleSignals(ctx, battleAttendances = [], behaviorEvents = [], now = new Date()) {
  const telemetryRows = Array.isArray(battleAttendances) ? battleAttendances : [];
  const modalBurstEvents = behaviorEvents.filter(
    (row) => row?.category === 'battle' && row?.eventType === 'battle_result_modal_same_spot_burst'
  );

  const aggregate = {
    shots: 0,
    intervalCount: 0,
    intervalSumMs: 0,
    intervalSqSumMs: 0,
    staticCursorShots: 0,
    hiddenTabShotCount: 0,
    screenMinNx: 1,
    screenMaxNx: 0,
    screenMinNy: 1,
    screenMaxNy: 0,
    voiceCommandsTotalAttempts: 0,
    voiceCommandsSuccess: 0,
  };

  let latestAt = now;
  telemetryRows.forEach((row) => {
    const telemetry = row?.automationTelemetry || {};
    aggregate.shots += Number(telemetry.shotTelemetryCount) || 0;
    aggregate.intervalCount += Number(telemetry.intervalCount) || 0;
    aggregate.intervalSumMs += Number(telemetry.intervalSumMs) || 0;
    aggregate.intervalSqSumMs += Number(telemetry.intervalSqSumMs) || 0;
    aggregate.staticCursorShots += Number(telemetry.staticCursorShots) || 0;
    aggregate.hiddenTabShotCount += Number(telemetry.hiddenTabShotCount) || 0;
    if (Number.isFinite(Number(telemetry.screenMinNx))) {
      aggregate.screenMinNx = Math.min(aggregate.screenMinNx, Number(telemetry.screenMinNx));
    }
    if (Number.isFinite(Number(telemetry.screenMaxNx))) {
      aggregate.screenMaxNx = Math.max(aggregate.screenMaxNx, Number(telemetry.screenMaxNx));
    }
    if (Number.isFinite(Number(telemetry.screenMinNy))) {
      aggregate.screenMinNy = Math.min(aggregate.screenMinNy, Number(telemetry.screenMinNy));
    }
    if (Number.isFinite(Number(telemetry.screenMaxNy))) {
      aggregate.screenMaxNy = Math.max(aggregate.screenMaxNy, Number(telemetry.screenMaxNy));
    }
    aggregate.voiceCommandsTotalAttempts += Number(row?.voiceCommandsTotalAttempts) || 0;
    aggregate.voiceCommandsSuccess += Number(row?.voiceCommandsSuccess) || 0;
    const happenedAt = new Date(row?.happenedAt || now);
    if (!Number.isNaN(happenedAt.getTime()) && happenedAt > latestAt) latestAt = happenedAt;
  });

  const staticRatio = aggregate.shots ? aggregate.staticCursorShots / aggregate.shots : 0;
  const intervalCv = coefficientFromMoments(
    aggregate.intervalSumMs,
    aggregate.intervalSqSumMs,
    aggregate.intervalCount
  );
  const screenWidth = Math.max(0, aggregate.screenMaxNx - aggregate.screenMinNx);
  const screenHeight = Math.max(0, aggregate.screenMaxNy - aggregate.screenMinNy);

  if (aggregate.shots >= 120 && staticRatio >= 0.72) {
    addSignal(ctx, {
      signal: 'battle_static_cursor',
      score: clamp(12 + Math.round(staticRatio * 20), 12, 26),
      category: 'battle',
      summary: `В бою ${aggregate.staticCursorShots} из ${aggregate.shots} выстрелов сделаны почти без движения курсора`,
      happenedAt: latestAt,
      meta: {
        shots: aggregate.shots,
        staticCursorShots: aggregate.staticCursorShots,
        staticRatio: round(staticRatio, 4),
        screenWidth: round(screenWidth, 4),
        screenHeight: round(screenHeight, 4),
      },
    });
  }

  if (aggregate.intervalCount >= 80 && intervalCv > 0 && intervalCv <= 0.08) {
    addSignal(ctx, {
      signal: 'battle_stable_click_rhythm',
      score: clamp(14 + Math.round((0.1 - intervalCv) * 100), 14, 28),
      category: 'battle',
      summary: `Слишком стабильный ритм кликов в бою (${aggregate.intervalCount} интервалов)`,
      happenedAt: latestAt,
      meta: {
        intervalCount: aggregate.intervalCount,
        intervalCv: round(intervalCv, 5),
      },
    });
  }

  if (aggregate.hiddenTabShotCount >= 5) {
    addSignal(ctx, {
      signal: 'battle_hidden_tab_shots',
      score: clamp(8 + aggregate.hiddenTabShotCount, 8, 18),
      category: 'battle',
      summary: `${aggregate.hiddenTabShotCount} выстрелов отправлены при скрытой вкладке`,
      happenedAt: latestAt,
      meta: { hiddenTabShotCount: aggregate.hiddenTabShotCount },
    });
  }

  if (modalBurstEvents.length) {
    const latest = sortByDate(modalBurstEvents, 'occurredAt').slice(-1)[0];
    addSignal(ctx, {
      signal: 'battle_result_modal_same_spot_burst',
      score: clamp(12 + modalBurstEvents.length * 4, 12, 24),
      category: 'battle',
      summary: `После окончания боя зафиксированы повторные клики в одну точку поверх модального окна (${modalBurstEvents.length})`,
      happenedAt: latest?.occurredAt || latestAt,
      meta: { modalBurstEvents: modalBurstEvents.length },
    });
  }

  if (
    aggregate.voiceCommandsTotalAttempts >= 8 &&
    aggregate.shots >= 120 &&
    aggregate.voiceCommandsSuccess / aggregate.voiceCommandsTotalAttempts <= 0.15
  ) {
    addSignal(ctx, {
      signal: 'battle_voice_ignore_pattern',
      score: 6,
      category: 'battle',
      summary: 'Игрок почти не реагирует на механику Голоса Мрака',
      happenedAt: latestAt,
      meta: {
        voiceCommandsTotalAttempts: aggregate.voiceCommandsTotalAttempts,
        voiceCommandsSuccess: aggregate.voiceCommandsSuccess,
      },
    });
  }
}

module.exports = {
  evaluateBattleSignals,
};
