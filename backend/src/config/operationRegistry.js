const OPERATION_REGISTRY = {
  'users.status.update': {
    domain: 'users',
    dangerous: true,
    requiresSecondApproval: false,
    confirmationPhrase: 'CONFIRM users.status.update',
    description: 'Изменение статуса пользователя',
  },
  'users.resources.adjust': {
    domain: 'economy',
    dangerous: true,
    requiresSecondApproval: false,
    confirmationPhrase: 'CONFIRM users.resources.adjust',
    description: 'Ручная корректировка ресурсов пользователя',
  },
  'game.battle.start_now': {
    domain: 'game',
    dangerous: true,
    requiresSecondApproval: false,
    confirmationPhrase: 'CONFIRM game.battle.start_now',
    description: 'Немедленный запуск боя',
  },
  'game.battle.schedule': {
    domain: 'game',
    dangerous: true,
    requiresSecondApproval: false,
    confirmationPhrase: 'CONFIRM game.battle.schedule',
    description: 'Планирование боя',
  },
  'game.battle.schedule_cancel': {
    domain: 'game',
    dangerous: true,
    requiresSecondApproval: false,
    confirmationPhrase: 'CONFIRM game.battle.schedule_cancel',
    description: 'Отмена запланированного боя',
  },
  'game.battle.finish_now': {
    domain: 'game',
    dangerous: true,
    requiresSecondApproval: false,
    confirmationPhrase: 'CONFIRM game.battle.finish_now',
    description: 'Принудительное завершение боя',
  },
  'system.backup.create': {
    domain: 'system',
    dangerous: true,
    requiresSecondApproval: false,
    confirmationPhrase: 'CONFIRM system.backup.create',
    description: 'Создание полного бэкапа данных',
  },
  'system.job.run': {
    domain: 'system',
    dangerous: true,
    requiresSecondApproval: false,
    confirmationPhrase: 'CONFIRM system.job.run',
    description: 'Принудительный запуск системной задачи',
  },
};

function getOperationMeta(actionType) {
  const meta = OPERATION_REGISTRY[actionType];
  if (!meta) return null;
  return { ...meta };
}

module.exports = {
  OPERATION_REGISTRY,
  getOperationMeta,
};
