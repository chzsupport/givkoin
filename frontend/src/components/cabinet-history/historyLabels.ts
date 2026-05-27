import { formatNumber } from '@/utils/formatters';
import type { EconomyHistoryItem, RadianceHistoryItem } from './types';

type Translate = (key: string) => string;

export function createCabinetHistoryLabels(t: Translate, language: string) {
  const radianceActivityNames: Record<string, string | ((amount: number) => string)> = {
    chat_1h: t('history.chat_1h'),
    chat_rate: (amount: number) => (amount === 2
      ? t('history.chat_rating_liked')
      : t('history.chat_rating_disliked')),
    friend_add: t('history.add_friend'),
    wish_create: t('history.make_wishes'),
    wish_support: t('history.support_wish'),
    bridge_contribute: t('history.place_stone'),
    bridge_create: t('history.start_bridge'),
    fortune_spin: t('history.wheel_fortune'),
    lottery_ticket_buy: t('history.lottery_purchase'),
    personal_luck: t('history.personal_luck'),
    entity_create: t('history.create_entity'),
    solar_collect: t('history.collect_lumens_hourly'),
    solar_share: t('history.share_lumens'),
    evil_root_confession: t('history.write_confessions'),
    tree_heal_button: t('history.heal_tree_directly'),
    news_like: t('history.post_like'),
    news_comment: t('history.comment'),
    news_repost: t('history.repost'),
    news_view: t('history.viewed_post'),
    achievement_any: t('history.achievement'),
    shard_collect: t('history.shard_collection'),
    night_shift: t('history.night_shift'),
    night_shift_anomaly: t('history.night_shift_anomaly'),
    night_shift_hour: t('history.night_shift_full_hour'),
    attendance_day: t('history.attendance_day'),
    shop_buy_item: t('history.shop_purchase'),
    shop_use_item: t('history.storage_use'),
    referral_active: t('history.referrals'),
    feedback_letter: t('history.feedback'),
    meditation_individual: t('history.individual_meditation'),
    meditation_group: t('history.group_meditation'),
    gratitude_write: t('history.write_gratitude'),
    fruit_collect: t('history.collect_fruit'),
  };

  const kTypeNames: Record<string, string> = {
    attendance_bonus: t('history.attendance_day'),
    solar_collect: t('history.solar_charge'),
    solar_share: t('history.transfer_lumens'),
    gratitude_write: t('history.gratitude'),
    crystal: t('history.shard_collection'),
    fruit_collect: t('history.fruit_collection'),
    night_shift: t('history.night_shift_cap'),
    appeal_compensation: t('history.compensation'),
    chat: t('history.chat'),
    battle: t('history.battle_damage_reward'),
    fortune: t('history.fortune'),
    referral: t('history.referral_bonus'),
    referral_blessing: t('history.referral_blessing'),
    wish: t('history.make_wishes'),
    stars: t('history.star_reward'),
    news_like: t('history.post_like'),
    news_comment: t('history.comment'),
    news_repost: t('history.repost'),
  };

  const starTypeNames: Record<string, string> = {
    gratitude_write: t('history.gratitude'),
    solar_share: t('history.transfer_lumens'),
    fortune_roulette: t('history.wheel_fortune'),
    fruit_collect: t('history.fruit_collection'),
    tree_heal: t('history.heal_tree'),
    wish_fulfill: t('history.wish_fulfilled'),
    chat_rating: t('history.chat_rating'),
    crystal: t('history.shard_collection'),
    night_shift: t('history.night_shift_cap'),
    stars: t('history.stars'),
  };

  const boostTypeNames: Record<string, string> = {
    gratitude_ad_boost: t('history.ad_boost_gratitude'),
    solar_ad_boost: t('history.ad_boost_solar'),
    roulette_ad_boost: t('history.ad_boost_roulette'),
    night_shift_ad_boost: t('history.ad_boost_night_shift'),
    crystal_ad_boost: t('history.ad_boost_crystal'),
    battle_ad_boost: t('history.ad_boost_battle'),
    fruit_ad_boost: t('history.ad_boost_fruit'),
    attendance_ad_boost: t('history.ad_boost_attendance'),
    personal_luck_ad_reward: t('history.ad_boost_personal_luck'),
    chat_boost: t('history.ad_boost_chat_key'),
    referral_blessing: t('history.ad_boost_referral_blessing'),
    ad_boost: t('history.ad_boost_generic'),
  };

  const getRadianceActivityName = (activityType: string, amount: number) => {
    const row = radianceActivityNames[String(activityType || '')];
    if (typeof row === 'function') return row(amount);
    return row || activityType;
  };

  const getTreeHealConversionText = (row: RadianceHistoryItem) => {
    if (row.activityType !== 'tree_heal_button') return null;
    const lumens = Number(row.meta?.lumens);
    if (!Number.isFinite(lumens) || lumens <= 0) return null;

    const radiance = Number(row.meta?.radiance);
    const safeRadiance = Number.isFinite(radiance) && radiance > 0 ? radiance : (Number(row.amount) || 0);

    return `−${formatNumber(lumens, language)} Lm = +${formatNumber(safeRadiance, language)} ${t('cabinet.radiance')}`;
  };

  const isExplicitBoostDescription = (description?: string | null) => {
    const normalized = String(description || '').trim().toLowerCase().replace(/\s+/g, ' ');
    return normalized.startsWith('\u0434\u043e\u043f\u043e\u043b\u043d\u0438\u0442\u0435\u043b\u044c\u043d\u0430\u044f \u043d\u0430\u0433\u0440\u0430\u0434\u0430')
      || normalized.startsWith('extra reward');
  };

  const resolveEconomyDescriptionKey = (description?: string | null) => {
    const normalized = String(description || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');

    if (!normalized) return null;
    if (normalized.includes('\u043b\u0438\u0447\u043d\u0430\u044f \u0443\u0434\u0430\u0447\u0430') || normalized.includes('personal luck')) return 'history.personal_luck';
    if (normalized.includes('\u0432\u044b\u0438\u0433\u0440\u044b\u0448 \u0432 \u043a\u043e\u043b\u0435\u0441\u0435 \u0444\u043e\u0440\u0442\u0443\u043d\u044b') || normalized.includes('fortune wheel winnings')) return 'history.wheel_fortune';
    if (normalized.includes('\u0432\u044b\u0438\u0433\u0440\u044b\u0448 \u0432 \u043b\u043e\u0442\u0435\u0440\u0435\u044e') || normalized.includes('lottery winnings')) return 'history.lottery_winnings';
    if (normalized.includes('\u043f\u043e\u0441\u0435\u0449\u0430\u0435\u043c\u043e\u0441\u0442\u044c: \u0434\u0435\u043d\u044c') || normalized.includes('attendance: day')) return 'history.attendance_day';
    if (normalized.includes('\u0441\u0431\u043e\u0440 \u0441\u043e\u043b\u043d\u0435\u0447\u043d\u043e\u0433\u043e \u0437\u0430\u0440\u044f\u0434\u0430') || normalized.includes('solar charge collection')) return 'history.solar_charge';
    if (normalized.includes('\u043f\u0435\u0440\u0435\u0434\u0430\u0447\u0430 \u043b\u044e\u043c\u0435\u043d\u043e\u0432') || normalized.includes('lumens transfer')) return 'history.transfer_lumens';
    if (normalized.includes('\u0431\u043b\u0430\u0433\u043e\u0434\u0430\u0440\u043d\u043e\u0441\u0442\u044c') || normalized.includes('gratitude')) return 'history.gratitude';
    if (normalized.includes('\u043d\u0430\u0433\u0440\u0430\u0434\u0430 \u0437\u0430 \u0443\u0440\u043e\u043d \u0432 \u0431\u043e\u044e') || normalized.includes('battle damage reward')) return 'history.battle_damage_reward';
    if (normalized.includes('\u0431\u043b\u0430\u0433\u043e\u0441\u043b\u043e\u0432\u0435\u043d\u0438\u0435 \u0440\u0435\u0444\u0435\u0440\u0430\u043b\u043e\u0432') || normalized.includes('referral blessing')) return 'history.referral_blessing';
    if (normalized.includes('\u0431\u043e\u043d\u0443\u0441 \u0437\u0430 \u0440\u0435\u0444\u0435\u0440\u0430\u043b\u0430') || normalized.includes('referral bonus')) return 'history.referral_bonus';
    if (normalized.includes('\u0440\u0435\u0444\u0435\u0440\u0430\u043b')) return 'history.referrals';
    return null;
  };

  const getEconomyEntryName = (row: EconomyHistoryItem, mode: 'k' | 'stars') => {
    if (isExplicitBoostDescription(row.description)) return String(row.description || '').trim();
    const boostTypeName = boostTypeNames[String(row.type || '')];
    if (boostTypeName) return boostTypeName;
    const descriptionKey = resolveEconomyDescriptionKey(row.description);
    if (descriptionKey) return t(descriptionKey);
    const map = mode === 'k' ? kTypeNames : starTypeNames;
    const typeKey = map[String(row.type || '')];
    if (typeKey) return typeKey;
    if (row.description) return row.description;
    return row.type || t('history.credit');
  };

  return {
    getEconomyEntryName,
    getRadianceActivityName,
    getTreeHealConversionText,
  };
}
