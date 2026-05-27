const { getSupabaseClient: defaultGetSupabaseClient } = require('../../lib/supabaseClient');
const { awardRadianceForActivity: defaultAwardRadianceForActivity } = require('../activityRadianceService');
const {
  countReferralRewardTransactionsSince: defaultCountReferralRewardTransactionsSince,
  findReferralByInviteeId: defaultFindReferralByInviteeId,
  hasReferralRewardKTransaction: defaultHasReferralRewardKTransaction,
  hasTransactionDailyReferralBonus: defaultHasTransactionDailyReferralBonus,
} = require('./authReferralStore');

function defaultPickLang(lang, ru, en) {
  return lang === 'en' ? en : ru;
}

function defaultGetKService() {
  return require('../kService');
}

function createAuthReferralRewards({
  awardRadianceForActivity = defaultAwardRadianceForActivity,
  countReferralRewardTransactionsSince = defaultCountReferralRewardTransactionsSince,
  findReferralByInviteeId = defaultFindReferralByInviteeId,
  getKService = defaultGetKService,
  getSupabaseClient = defaultGetSupabaseClient,
  hasReferralRewardKTransaction = defaultHasReferralRewardKTransaction,
  hasTransactionDailyReferralBonus = defaultHasTransactionDailyReferralBonus,
  logError = console.error,
  now = () => new Date(),
} = {}) {
  async function settleLoginReferralReward({
    dailyBonusK = 100,
    dailyLimit = 10,
    lang = 'ru',
    pickLang = defaultPickLang,
    referralBonusK = 20,
    user,
  }) {
    if (!user?._id) {
      return { settled: false, reason: 'missing_user' };
    }

    const existingReferral = await findReferralByInviteeId(user._id);

    if (!existingReferral || !existingReferral.confirmed_at || existingReferral.bonus_granted) {
      return { settled: false, reason: 'not_rewardable' };
    }

    const supabase = getSupabaseClient();
    const nowIso = now().toISOString();
    const { data: rewardableReferral, error: rewardableReferralError } = await supabase
      .from('referrals')
      .update({
        bonus_granted: true,
        updated_at: nowIso,
      })
      .eq('id', Number(existingReferral.id))
      .eq('bonus_granted', false)
      .select('*')
      .maybeSingle();

    if (rewardableReferralError || !rewardableReferral) {
      return { settled: false, reason: 'not_claimed' };
    }

    try {
      const { awardReferralK, creditK } = getKService();
      const hasReferralK = await hasReferralRewardKTransaction({
        userId: rewardableReferral.inviter_id,
        referralId: rewardableReferral.id,
      });

      if (!hasReferralK) {
        await awardReferralK({
          userId: rewardableReferral.inviter_id,
          bonus: referralBonusK,
          description: pickLang(
            lang,
            `Бонус за реферала: ${String(user.nickname || '')}`,
            `Referral bonus: ${String(user.nickname || '')}`,
          ),
          relatedEntity: rewardableReferral.id,
        });
      }

      await awardRadianceForActivity({
        userId: rewardableReferral.inviter_id,
        amount: 20,
        activityType: 'referral_active',
        meta: { invitee: user._id, referralId: rewardableReferral.id },
        dedupeKey: `referral_reward:${String(rewardableReferral.id)}`,
      });

      const since24h = new Date(now().getTime() - 24 * 60 * 60 * 1000);
      const last24RewardCount = await countReferralRewardTransactionsSince({
        userId: rewardableReferral.inviter_id,
        since: since24h,
      });

      if (last24RewardCount === dailyLimit) {
        const alreadyDailyBonus = await hasTransactionDailyReferralBonus({
          userId: rewardableReferral.inviter_id,
          since: since24h,
        });

        if (!alreadyDailyBonus) {
          await creditK({
            userId: rewardableReferral.inviter_id,
            amount: dailyBonusK,
            type: 'referral',
            description: pickLang(lang, 'Бонус за 10-го реферала за сутки', '10th referral bonus for the day'),
            relatedEntity: rewardableReferral.id,
          });
        }
      }

      return { settled: true, referralId: rewardableReferral.id };
    } catch (err) {
      logError('Error awarding referral login bonus:', err);
      await supabase
        .from('referrals')
        .update({
          bonus_granted: false,
          updated_at: now().toISOString(),
        })
        .eq('id', Number(existingReferral.id));

      return { settled: false, reason: 'award_failed' };
    }
  }

  return {
    settleLoginReferralReward,
  };
}

module.exports = {
  ...createAuthReferralRewards(),
  createAuthReferralRewards,
};
