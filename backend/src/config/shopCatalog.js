const { normalizeRequestLanguage } = require('../utils/requestLanguage');

const SHOP_ITEMS = [
  {
    key: 'entity_food_light',
    category: 'entity',
    translations: {
      ru: { title: 'Лёгкая пища', description: 'Сущность сытая 24 часа.' },
      en: { title: 'Light Meal', description: 'Keeps the entity full for 24 hours.' },
    },
    priceK: 25,
    satietyHours: 24,
  },
  {
    key: 'entity_food_meal',
    category: 'entity',
    translations: {
      ru: { title: 'Сытный обед', description: 'Сущность сытая 72 часа.' },
      en: { title: 'Hearty Meal', description: 'Keeps the entity full for 72 hours.' },
    },
    priceK: 60,
    satietyHours: 72,
  },
  {
    key: 'entity_food_week',
    category: 'entity',
    translations: {
      ru: { title: 'Недельный запас', description: 'Сущность сытая 168 часов.' },
      en: { title: 'Weekly Stock', description: 'Keeps the entity full for 168 hours.' },
    },
    priceK: 100,
    satietyHours: 168,
  },
  {
    key: 'boost_battle_accuracy',
    category: 'boost',
    translations: {
      ru: { title: 'Тотем точности', description: '+15% урона в одном бою.' },
      en: { title: 'Aim Totem', description: '+15% damage in one battle.' },
    },
    priceK: 95,
  },
  {
    key: 'boost_battle_economy',
    category: 'boost',
    translations: {
      ru: { title: 'Щит экономии', description: '-25% расход Люменов в одном бою.' },
      en: { title: 'Saving Shield', description: '-25% Lumens spent in one battle.' },
    },
    priceK: 115,
  },
  {
    key: 'boost_weak_zone_focus',
    category: 'boost',
    translations: {
      ru: { title: 'Фокус слабых зон', description: '+50% к урону по мигающим зонам в одном бою.' },
      en: { title: 'Weak-Spot Focus', description: '+50% damage to flashing weak spots in one battle.' },
    },
    priceK: 125,
  },
  {
    key: 'boost_chat_key',
    category: 'boost',
    translations: {
      ru: { title: 'Ключ взаимопонимания', description: '+25% K за час общения (15 вместо 12).' },
      en: { title: 'Harmony Key', description: '+25% K for one hour of chat (15 instead of 12).' },
    },
    priceK: 75,
  },
  {
    key: 'boost_solar_focus',
    category: 'boost',
    translations: {
      ru: { title: 'Фокус Кристалла', description: 'На следующие 3 сбора Солнечного Заряда: +20 Люменов (120 вместо 100).' },
      en: { title: 'Crystal Focus', description: 'For the next 3 Solar Charge collects: +20 Lumens (120 instead of 100).' },
    },
    priceK: 80,
    solarCharges: 3,
    solarExtraLm: 20,
  },
  {
    key: 'boost_referral_blessing',
    category: 'boost',
    translations: {
      ru: { title: 'Благословение Рефералов', description: '5% от всех K, полученных рефералом, получает рефовод. Срок 24 часа.' },
      en: { title: 'Referral Blessing', description: 'The referrer gets 5% of all K earned by the referral for 24 hours.' },
    },
    priceK: 450,
    blessingHours: 24,
    referralPercent: 5,
  },
];

function localizeShopItem(item, language = 'ru') {
  if (!item) return null;
  const locale = normalizeRequestLanguage(language);
  const localized = item.translations?.[locale] || item.translations?.ru || {};
  return {
    ...item,
    title: localized.title || '',
    description: localized.description || '',
  };
}

function listLocalizedShopItems(language = 'ru') {
  return SHOP_ITEMS.map((item) => localizeShopItem(item, language));
}

const SHOP_ITEMS_BY_KEY = SHOP_ITEMS.reduce((acc, item) => {
  acc[item.key] = item;
  return acc;
}, {});

const WAREHOUSE_ITEM_EFFECTS = {
  boost_battle_accuracy: { kind: 'bonus_percent', unit: 'percent', sign: '+', baseValue: 15, boostedValue: 20 },
  boost_battle_economy: { kind: 'discount_percent', unit: 'percent', sign: '-', baseValue: 25, boostedValue: 30 },
  boost_weak_zone_focus: { kind: 'bonus_percent', unit: 'percent', sign: '+', baseValue: 50, boostedValue: 55 },
  boost_chat_key: { kind: 'bonus_percent', unit: 'percent', sign: '+', baseValue: 25, boostedValue: 30 },
  boost_solar_focus: { kind: 'lumens_flat', unit: 'lm', sign: '+', baseValue: 20, boostedValue: 25 },
  boost_referral_blessing: { kind: 'bonus_percent', unit: 'percent', sign: '+', baseValue: 5, boostedValue: 10 },
};

function getWarehouseItemEffect(itemKey, options = {}) {
  const effect = WAREHOUSE_ITEM_EFFECTS[String(itemKey || '')];
  if (!effect) return null;
  const adBoosted = Boolean(options.adBoosted);
  const activeValue = adBoosted ? effect.boostedValue : effect.baseValue;
  return {
    kind: effect.kind,
    unit: effect.unit,
    sign: effect.sign,
    baseValue: effect.baseValue,
    boostedValue: effect.boostedValue,
    activeValue,
    bonusValue: adBoosted ? Math.max(0, effect.boostedValue - effect.baseValue) : 0,
    adBoosted,
    appliedAt: options.appliedAt || null,
    boostedAt: adBoosted ? (options.boostedAt || new Date().toISOString()) : null,
  };
}

module.exports = {
  SHOP_ITEMS,
  SHOP_ITEMS_BY_KEY,
  WAREHOUSE_ITEM_EFFECTS,
  getWarehouseItemEffect,
  listLocalizedShopItems,
  localizeShopItem,
};

