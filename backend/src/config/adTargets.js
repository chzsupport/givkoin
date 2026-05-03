const AD_TARGETS = Object.freeze([
  { id: 'all', name: 'Все страницы' },
  { id: 'about', name: 'О нас' },
  { id: 'rules', name: 'Правила' },
  { id: 'roadmap', name: 'Дорожная карта' },
  { id: 'feedback', name: 'Обратная связь' },
  { id: 'fortune', name: 'Фортуна' },
  { id: 'fortune/roulette', name: 'Рулетка' },
  { id: 'fortune/lottery', name: 'Лотерея' },
  { id: 'shop', name: 'Магазин' },
  { id: 'night_shift', name: 'Ночная смена' },
  { id: 'practice', name: 'Практика' },
  { id: 'practice_gratitude', name: 'Благодарность' },
  { id: 'practice_meditation', name: 'Медитации' },
  { id: 'activity_collect', name: 'Сбор осколков' },
  { id: 'activity_achievements', name: 'Достижения' },
  { id: 'activity_attendance', name: 'Посещаемость' },
  { id: 'news', name: 'Новости' },
  { id: 'chronicle', name: 'Летопись' },
  { id: 'chat', name: 'Чат' },
  { id: 'galaxy', name: 'Галактика желаний' },
  { id: 'bridges', name: 'Мосты' },
  { id: 'battle', name: 'Бой' },
  { id: 'cabinet/referrals', name: 'Рефералы' },
  { id: 'entity/profile', name: 'Профиль сущности' },
  { id: 'entity', name: 'Панели Древа: сущность' },
  { id: 'solar', name: 'Панели Древа: энергия' },
]);

const AD_TARGET_IDS = new Set(AD_TARGETS.map((target) => target.id));

function normalizeAdTargetList(value) {
  const raw = Array.isArray(value) ? value : [value];
  const targets = raw
    .flatMap((item) => String(item || '').split(','))
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => AD_TARGET_IDS.has(item));

  const unique = Array.from(new Set(targets));
  if (!unique.length || unique.includes('all')) return ['all'];
  return unique;
}

module.exports = {
  AD_TARGETS,
  AD_TARGET_IDS,
  normalizeAdTargetList,
};
