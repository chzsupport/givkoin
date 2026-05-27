const {
  getModelDocById,
  listModelDocs,
} = require('./battleDocuments');
const battleRuntimeStore = require('../battleRuntimeStore');

function findBattleByStatusFallbackFromRows(rows, status, sortMode = 'desc') {
  const filtered = (Array.isArray(rows) ? rows : [])
    .filter((row) => String(row?.status || '') === String(status));
  filtered.sort((a, b) => {
    const aTime = a?.startsAt ? new Date(a.startsAt).getTime() : 0;
    const bTime = b?.startsAt ? new Date(b.startsAt).getTime() : 0;
    return sortMode === 'asc' ? aTime - bTime : bTime - aTime;
  });
  return filtered[0] || null;
}

async function findBattleByStatusFallback(status, sortMode = 'desc') {
  const all = await listModelDocs('Battle');
  return findBattleByStatusFallbackFromRows(all, status, sortMode);
}

function listScheduledBattlesFromRows(rows, { includeAuto = false } = {}) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => {
      if (String(row?.status || '') !== 'scheduled') return false;
      if (!includeAuto && String(row?.scheduleSource || '') === 'auto') return false;
      return true;
    })
    .sort((a, b) => {
      const aTime = a?.startsAt ? new Date(a.startsAt).getTime() : 0;
      const bTime = b?.startsAt ? new Date(b.startsAt).getTime() : 0;
      return aTime - bTime;
    });
}

async function listScheduledBattles({ includeAuto = false } = {}) {
  const all = await listModelDocs('Battle');
  return listScheduledBattlesFromRows(all, { includeAuto });
}

async function resolveBattleByPointer({ kind, expectedStatus, fallbackSortMode }) {
  const pointer = await battleRuntimeStore.getBattlePointer(kind).catch(() => null);
  const pointedBattleId = String(pointer?.battleId || '').trim();

  if (pointedBattleId) {
    const pointedBattle = await getModelDocById('Battle', pointedBattleId);
    if (pointedBattle && String(pointedBattle.status || '') === String(expectedStatus)) {
      return pointedBattle;
    }
    await battleRuntimeStore.clearBattlePointer(kind, pointedBattleId).catch(() => {});
  }

  // Запасной путь нужен только чтобы подхватить уже существующий бой после обновления.
  const fallbackBattle = await findBattleByStatusFallback(expectedStatus, fallbackSortMode);
  if (fallbackBattle?._id) {
    await battleRuntimeStore.setBattlePointer(kind, fallbackBattle._id).catch(() => {});
  }
  return fallbackBattle || null;
}

module.exports = {
  findBattleByStatusFallback,
  findBattleByStatusFallbackFromRows,
  listScheduledBattles,
  listScheduledBattlesFromRows,
  resolveBattleByPointer,
};
