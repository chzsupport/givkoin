const { spendK } = require('../services/kService');
const { SHOP_ITEMS, listLocalizedShopItems, localizeShopItem } = require('../config/shopCatalog');
const { awardRadianceForActivity } = require('../services/activityRadianceService');
const { createAdBoostOffer } = require('../services/adBoostService');
const { getSupabaseClient } = require('../lib/supabaseClient');
const { getRequestLanguage, pickRequestLanguage } = require('../utils/requestLanguage');

const DOC_TABLE = String(process.env.SUPABASE_TABLE || 'app_documents').trim() || 'app_documents';

async function insertWarehouseItem(doc) {
  const supabase = getSupabaseClient();
  const id = `wi_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const nowIso = new Date().toISOString();
  await supabase.from(DOC_TABLE).insert({
    model: 'WarehouseItem',
    id,
    data: doc,
    created_at: nowIso,
    updated_at: nowIso,
  });
  return { ...doc, _id: id };
}

exports.getCatalog = async (req, res) => {
  const userLang = getRequestLanguage(req);
  return res.json({ items: listLocalizedShopItems(userLang) });
};

exports.buyItem = async (req, res) => {
  try {
    const userLang = getRequestLanguage(req);
    const { itemKey } = req.body || {};
    if (!itemKey) {
      return res.status(400).json({ message: pickRequestLanguage(req, 'Не указан товар', 'Item is required') });
    }

    const item = SHOP_ITEMS.find((x) => x.key === itemKey);
    if (!item) {
      return res.status(400).json({ message: pickRequestLanguage(req, 'Товар не найден', 'Item not found') });
    }
    const localizedItem = localizeShopItem(item, userLang);

    const userId = req.user?._id;
    const supabase = getSupabaseClient();
    const { data: userRow, error: userError } = await supabase
      .from('users')
      .select('id,data')
      .eq('id', String(userId))
      .maybeSingle();
    if (userError || !userRow) {
      return res.status(404).json({ message: pickRequestLanguage(req, 'Пользователь не найден', 'User not found') });
    }
    const userData = userRow.data && typeof userRow.data === 'object' ? userRow.data : {};

    const price = Number(item.priceK) || 0;
    if (price <= 0) {
      return res.status(400).json({ message: pickRequestLanguage(req, 'Некорректная цена', 'Invalid price') });
    }

    if ((Number(userData.k) || 0) < price) {
      return res.status(400).json({ message: pickRequestLanguage(req, 'Недостаточно K', 'Not enough K') });
    }

    const updatedUser = await spendK({
      userId,
      amount: price,
      type: 'shop',
      description: pickRequestLanguage(req, `Покупка: ${localizedItem.title}`, `Purchase: ${localizedItem.title}`),
    });

    const warehouseItem = await insertWarehouseItem({
      user: userId,
      itemKey: item.key,
      category: item.category,
      title: localizedItem.title,
      description: localizedItem.description,
      priceK: price,
      status: 'stored',
      purchasedAt: new Date().toISOString(),
    });

    awardRadianceForActivity({
      userId,
      amount: 5,
      activityType: 'shop_buy_item',
      meta: { itemKey: item.key, warehouseItemId: warehouseItem._id },
      dedupeKey: `shop_buy_item:${warehouseItem._id}:${userId}`,
    }).catch(() => { });

    const boostOffer = await createAdBoostOffer({
      userId,
      type: 'shop_random_item',
      contextKey: `shop:${warehouseItem._id}`,
      page: 'shop',
      title: pickRequestLanguage(req, 'Получить случайный предмет', 'Get a random item'),
      description: pickRequestLanguage(req, 'Досмотрите видео, чтобы получить один случайный предмет из магазина.', 'Watch the video to receive one random shop item.'),
      reward: {
        kind: 'shop_random_item',
        purchasedItemKey: item.key,
      },
    }).catch(() => null);

    return res.json({
      ok: true,
      user: { k: updatedUser.k, lumens: updatedUser.lumens, stars: updatedUser.stars },
      item: {
        ...warehouseItem,
        title: localizedItem.title,
        description: localizedItem.description,
      },
      boostOffer,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || pickRequestLanguage(req, 'Ошибка сервера', 'Server error') });
  }
};

