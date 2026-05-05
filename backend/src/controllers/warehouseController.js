const { SHOP_ITEMS_BY_KEY, getWarehouseItemEffect, localizeShopItem } = require('../config/shopCatalog');
const { awardRadianceForActivity } = require('../services/activityRadianceService');
const { updateEntityMoodForUser } = require('../services/entityMoodService');
const { createAdBoostOffer } = require('../services/adBoostService');
const { getSupabaseClient } = require('../lib/supabaseClient');
const { getRequestLanguage } = require('../utils/requestLanguage');



const DOC_TABLE = String(process.env.SUPABASE_TABLE || 'app_documents').trim() || 'app_documents';



function normalizeLang(value) {

  return value === 'en' ? 'en' : 'ru';

}



function pickLang(lang, ru, en) {

  return normalizeLang(lang) === 'en' ? en : ru;

}



function isSated(entity, now = new Date()) {

  if (!entity?.satietyUntil) return false;

  return new Date(entity.satietyUntil).getTime() > now.getTime();

}



async function getUserRowById(userId) {

  if (!userId) return null;

  const supabase = getSupabaseClient();

  const { data, error } = await supabase

    .from('users')

    .select('id,data')

    .eq('id', String(userId))

    .maybeSingle();

  if (error) return null;

  return data || null;

}



async function updateUserDataById(userId, patch) {

  if (!userId || !patch || typeof patch !== 'object') return null;

  const supabase = getSupabaseClient();

  const row = await getUserRowById(userId);

  if (!row) return null;

  const existing = row.data && typeof row.data === 'object' ? row.data : {};

  const next = { ...existing, ...patch };

  const nowIso = new Date().toISOString();

  const { data, error } = await supabase

    .from('users')

    .update({ data: next, updated_at: nowIso })

    .eq('id', String(userId))

    .select('id,data')

    .maybeSingle();

  if (error) return null;

  return data || null;

}



async function listWarehouseItems(userId) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(DOC_TABLE)

    .select('id,data,created_at')

    .eq('model', 'WarehouseItem')

    .eq('data->>user', String(userId))

    .order('created_at', { ascending: false })
    .limit(500);
  if (error || !Array.isArray(data)) return [];
  const items = data
    .map((row) => ({ ...row.data, _id: row.id, createdAt: row.created_at }))
    .sort((a, b) => (b.purchasedAt || b.createdAt || '').localeCompare(a.purchasedAt || a.createdAt || ''));

  const usedItemIds = items
    .filter((item) => item?.status === 'used')
    .map((item) => String(item?._id || ''))
    .filter(Boolean);
  if (!usedItemIds.length) return items;

  const { data: offerRows } = await supabase
    .from(DOC_TABLE)
    .select('data')
    .eq('model', 'AdBoostOffer')
    .eq('data->>user', String(userId))
    .eq('data->>type', 'warehouse_item_upgrade')
    .eq('data->>status', 'completed')
    .limit(1000);
  const boostedItemIds = new Set(
    (Array.isArray(offerRows) ? offerRows : [])
      .map((row) => String(row?.data?.reward?.itemId || row?.data?.contextKey || '').replace(/^warehouse:/, ''))
      .filter((id) => usedItemIds.includes(id))
  );

  if (!boostedItemIds.size) return items;
  return items.map((item) => {
    if (!boostedItemIds.has(String(item?._id || ''))) return item;
    const existingEffect = item.usageEffect && typeof item.usageEffect === 'object' ? item.usageEffect : {};
    if (existingEffect.adBoosted) return item;
    const usageEffect = getWarehouseItemEffect(item.itemKey, {
      adBoosted: true,
      appliedAt: existingEffect.appliedAt || item.usedAt || null,
      boostedAt: existingEffect.boostedAt || null,
    });
    return usageEffect ? { ...item, usageEffect } : item;
  });
}


async function findWarehouseItem(itemId, userId) {

  const supabase = getSupabaseClient();

  const { data, error } = await supabase

    .from(DOC_TABLE)

    .select('id,data')

    .eq('model', 'WarehouseItem')

    .eq('id', String(itemId))

    .eq('data->>user', String(userId))

    .maybeSingle();

  if (error || !data) return null;

  return { ...data.data, _id: data.id };

}



async function updateWarehouseItem(itemId, patch, currentData = null) {

  const supabase = getSupabaseClient();

  const nowIso = new Date().toISOString();

  const baseData = currentData && typeof currentData === 'object'

    ? (() => {

      const { _id, ...rest } = currentData;

      void _id;

      return rest;

    })()

    : await (async () => {

      const { data: existing, error: findError } = await supabase

        .from(DOC_TABLE)

        .select('id,data')

        .eq('model', 'WarehouseItem')

        .eq('id', String(itemId))

        .maybeSingle();

      if (findError || !existing) return null;

      return existing.data || null;

    })();

  if (!baseData) return null;



  const nextData = { ...baseData, ...patch };

  const { data, error } = await supabase

    .from(DOC_TABLE)

    .update({ data: nextData, updated_at: nowIso })

    .eq('id', String(itemId))

    .select('id,data')

    .maybeSingle();

  if (error) return null;

  return { ...data.data, _id: data.id };

}



function localizeWarehouseItem(item, language = 'ru') {
  if (!item) return item;
  const catalogItem = SHOP_ITEMS_BY_KEY[item.itemKey];
  if (!catalogItem) return item;
  const localized = localizeShopItem(catalogItem, language);
  const fallbackEffect = item.status === 'used' && !item.usageEffect
    ? getWarehouseItemEffect(item.itemKey, { adBoosted: false, appliedAt: item.usedAt || null })
    : null;
  return {
    ...item,
    title: localized.title || item.title || '',
    description: localized.description || item.description || '',
    ...(fallbackEffect ? { usageEffect: fallbackEffect } : {}),
  };
}


exports.list = async (req, res) => {

  try {

    const userLang = getRequestLanguage(req);

    const items = await listWarehouseItems(req.user._id);

    return res.json({ items: items.map((item) => localizeWarehouseItem(item, userLang)) });

  } catch (error) {

    return res.status(500).json({ message: error.message || 'Server error' });

  }

};



exports.useItem = async (req, res) => {

  try {

    const { itemId } = req.body || {};

    const userLang = getRequestLanguage(req);

    if (!itemId) {

      return res.status(400).json({ message: 'itemId is required' });

    }



    const warehouseItem = await findWarehouseItem(itemId, req.user._id);

    if (!warehouseItem) {

      return res.status(404).json({ message: pickLang(userLang, 'Предмет не найден', 'Item not found') });

    }

    if (warehouseItem.status !== 'stored') {

      return res.status(400).json({ message: pickLang(userLang, 'Предмет уже использован', 'Item has already been used') });

    }



    const catalogItem = SHOP_ITEMS_BY_KEY[warehouseItem.itemKey];

    if (!catalogItem) {

      return res.status(400).json({ message: pickLang(userLang, 'Товар не найден в каталоге', 'Item not found in catalog') });

    }

    const localizedCatalogItem = localizeShopItem(catalogItem, userLang);



    const now = new Date();



    if (catalogItem.key === 'entity_food_light' || catalogItem.key === 'entity_food_meal' || catalogItem.key === 'entity_food_week') {

      const supabase = getSupabaseClient();

      const { data: entityRow, error: entityError } = await supabase

        .from('entities')

        .select('*')

        .eq('user_id', String(req.user._id))

        .maybeSingle();

      if (entityError || !entityRow) {

        return res.status(400).json({ message: pickLang(userLang, 'Сущность не найдена', 'Entity not found') });

      }



      const entity = {

        satietyUntil: entityRow.satiety_until,

      };



      if (isSated(entity, now)) {

        return res.status(400).json({ message: pickLang(userLang, 'Сущность сытая, попробуйте позже', 'Entity is full, please try later') });

      }



      const hours = Number(catalogItem.satietyHours) || 0;

      const until = new Date(now.getTime() + hours * 60 * 60 * 1000);



      const history = Array.isArray(entityRow.history) ? entityRow.history : [];

      history.unshift({

        message: userLang === 'en' ? `Fed: ${localizedCatalogItem.title}` : `Покормлена: ${localizedCatalogItem.title}`,

        createdAt: now.toISOString(),

      });

      const nowIso = now.toISOString();

      const { data: updatedEntityRow, error: updateEntityError } = await supabase

        .from('entities')

        .update({

          satiety_until: until.toISOString(),

          history,

          updated_at: nowIso,

        })

        .eq('id', Number(entityRow.id))

        .select('*')

        .maybeSingle();

      if (updateEntityError || !updatedEntityRow) {

        return res.status(500).json({ message: pickLang(userLang, 'Не удалось обновить сущность', 'Failed to update entity') });

      }



      await updateWarehouseItem(itemId, { status: 'used', usedAt: now.toISOString() }, warehouseItem);



      awardRadianceForActivity({

        userId: req.user._id,

        activityType: 'shop_use_item',

        meta: { warehouseItemId: itemId, itemKey: warehouseItem.itemKey },

        dedupeKey: `shop_use_item:${itemId}:${req.user._id}`,

      }).catch(() => { });



      const moodState = await updateEntityMoodForUser(req.user._id).catch(() => null);



      const userRow = await getUserRowById(req.user._id);

      const userData = userRow?.data && typeof userRow.data === 'object' ? userRow.data : {};



      const boostOffer = await createAdBoostOffer({
        userId: req.user._id,
        type: 'warehouse_item_upgrade',
        contextKey: `warehouse:${itemId}`,
        page: 'shop',
        title: pickLang(userLang, 'Усилить предмет', 'Upgrade item'),
        description: pickLang(userLang, 'Досмотрите видео, чтобы продлить сытость на 12 часов.', 'Watch the video to extend satiety by 12 hours.'),
        reward: {
          kind: 'warehouse_upgrade',
          itemKey: catalogItem.key,
          itemId,
        },
      }).catch(() => null);

      return res.json({
        ok: true,
        message: pickLang(userLang, 'Сущность накормлена', 'Entity has been fed'),
        item: localizeWarehouseItem({ ...warehouseItem, status: 'used', usedAt: now.toISOString() }, userLang),
        user: { sc: userData?.sc, lumens: userData?.lumens, stars: userData?.stars },
        boostOffer,
        entity: {
          _id: updatedEntityRow.id,

          user: updatedEntityRow.user_id,

          name: updatedEntityRow.name,

          avatarUrl: updatedEntityRow.avatar_url,

          stage: updatedEntityRow.stage,

          mood: moodState?.mood || updatedEntityRow.mood,

          satietyUntil: updatedEntityRow.satiety_until,

          createdAt: updatedEntityRow.created_at,

          updatedAt: updatedEntityRow.updated_at,

          history: updatedEntityRow.history,

        },

      });

    }



    const userRow = await getUserRowById(req.user._id);

    if (!userRow) {

      return res.status(404).json({ message: pickLang(userLang, 'Пользователь не найден', 'User not found') });

    }



    const userData = userRow.data && typeof userRow.data === 'object' ? userRow.data : {};

    const shopBoosts = userData.shopBoosts && typeof userData.shopBoosts === 'object' ? userData.shopBoosts : {};



    if (catalogItem.key === 'boost_battle_accuracy') {
      if (shopBoosts.battleDamage?.pending) {
        return res.status(400).json({ message: pickLang(userLang, 'Усиление уже подготовлено', 'Enhancement is already prepared') });
      }
      shopBoosts.battleDamage = { pending: true, bonusPercent: 15, adBoosted: false, sourceWarehouseItemId: itemId };
    } else if (catalogItem.key === 'boost_battle_economy') {
      if (shopBoosts.battleLumensDiscount?.pending) {
        return res.status(400).json({ message: pickLang(userLang, 'Усиление уже подготовлено', 'Enhancement is already prepared') });
      }
      shopBoosts.battleLumensDiscount = { pending: true, discountPercent: 25, adBoosted: false, sourceWarehouseItemId: itemId };
    } else if (catalogItem.key === 'boost_weak_zone_focus') {
      if (shopBoosts.weakZoneDamage?.pending) {
        return res.status(400).json({ message: pickLang(userLang, 'Усиление уже подготовлено', 'Enhancement is already prepared') });
      }
      shopBoosts.weakZoneDamage = { pending: true, bonusPercent: 50, adBoosted: false, sourceWarehouseItemId: itemId };
    } else if (catalogItem.key === 'boost_chat_key') {
      if (shopBoosts.chatSc?.pending) {
        return res.status(400).json({ message: pickLang(userLang, 'Усиление уже подготовлено', 'Enhancement is already prepared') });
      }
      shopBoosts.chatSc = { pending: true, bonusPercent: 25, adBoosted: false, sourceWarehouseItemId: itemId };
    } else if (catalogItem.key === 'boost_solar_focus') {
      const charges = Number(catalogItem.solarCharges) || 0;
      shopBoosts.solarExtraLmCharges = (Number(shopBoosts.solarExtraLmCharges) || 0) + charges;
      shopBoosts.solarExtraLmAmount = Number(catalogItem.solarExtraLm) || 20;
      shopBoosts.solarFocusAdBoosted = false;
      shopBoosts.solarFocusSourceWarehouseItemId = itemId;
    } else if (catalogItem.key === 'boost_referral_blessing') {
      const until = shopBoosts.referralBlessingUntil ? new Date(shopBoosts.referralBlessingUntil) : null;
      if (until && until.getTime() > now.getTime()) {
        return res.status(400).json({ message: pickLang(userLang, 'Благословение уже активно', 'Blessing is already active') });
      }
      const hours = Number(catalogItem.blessingHours) || 0;
      shopBoosts.referralBlessingUntil = new Date(now.getTime() + hours * 60 * 60 * 1000).toISOString();
      shopBoosts.referralBlessingPercent = Number(catalogItem.referralPercent) || 5;
      shopBoosts.referralBlessingAdBoosted = false;
      shopBoosts.referralBlessingSourceWarehouseItemId = itemId;
    } else {
      return res.status(400).json({ message: pickLang(userLang, 'Неизвестный предмет', 'Unknown item') });
    }


    const updatedUserRow = await updateUserDataById(req.user._id, {

      shopBoosts,

    });

    const updatedUserData = updatedUserRow?.data && typeof updatedUserRow.data === 'object' ? updatedUserRow.data : {};



    const usageEffect = getWarehouseItemEffect(catalogItem.key, {
      adBoosted: false,
      appliedAt: now.toISOString(),
    });
    const updatedWarehouseItem = await updateWarehouseItem(itemId, {
      status: 'used',
      usedAt: now.toISOString(),
      ...(usageEffect ? { usageEffect } : {}),
    }, warehouseItem);


    awardRadianceForActivity({

      userId: req.user._id,

      activityType: 'shop_use_item',

      meta: { warehouseItemId: itemId, itemKey: warehouseItem.itemKey },

      dedupeKey: `shop_use_item:${itemId}:${req.user._id}`,

    }).catch(() => { });



    const boostOffer = await createAdBoostOffer({
      userId: req.user._id,
      type: 'warehouse_item_upgrade',
      contextKey: `warehouse:${itemId}`,
      page: 'shop',
      title: pickLang(userLang, 'Усилить предмет', 'Upgrade item'),
      description: pickLang(userLang, 'Досмотрите видео, чтобы усилить действие предмета.', 'Watch the video to strengthen the item effect.'),
      reward: {
        kind: 'warehouse_upgrade',
        itemKey: catalogItem.key,
        itemId,
      },
    }).catch(() => null);

    return res.json({
      ok: true,
      message: pickLang(userLang, 'Предмет использован', 'Item used'),
      item: localizeWarehouseItem(updatedWarehouseItem || {
        ...warehouseItem,
        status: 'used',
        usedAt: now.toISOString(),
        ...(usageEffect ? { usageEffect } : {}),
      }, userLang),
      user: {
        sc: updatedUserData?.sc,
        lumens: updatedUserData?.lumens,
        stars: updatedUserData?.stars,
        shopBoosts: updatedUserData?.shopBoosts,
      },
      boostOffer,
    });
  } catch (error) {

    return res.status(500).json({ message: error.message || 'Server error' });

  }

};



