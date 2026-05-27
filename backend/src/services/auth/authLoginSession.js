const {
  createUserSession: defaultCreateUserSession,
  writeAuthEvent: defaultWriteAuthEvent,
} = require('../authTrackingService');
const { generateToken: defaultGenerateToken } = require('./authHelpers');
const { settleLoginReferralReward: defaultSettleLoginReferralReward } = require('./authReferralRewards');
const { repairDamagedUserData: defaultRepairDamagedUserData } = require('./authUserRecovery');
const {
  buildSafeUserWithEntity: defaultBuildSafeUserWithEntity,
  getUserRowById: defaultGetUserRowById,
} = require('./authUserStore');

function defaultPickLang(lang, ru, en) {
  return lang === 'en' ? en : ru;
}

function createAuthLoginSession({
  buildSafeUserWithEntity = defaultBuildSafeUserWithEntity,
  createUserSession = defaultCreateUserSession,
  generateToken = defaultGenerateToken,
  getUserRowById = defaultGetUserRowById,
  repairDamagedUserData = defaultRepairDamagedUserData,
  settleLoginReferralReward = defaultSettleLoginReferralReward,
  writeAuthEvent = defaultWriteAuthEvent,
} = {}) {
  async function openLoginSession({
    user,
    userRow,
    req,
    dailyLimit = 10,
    lang = 'ru',
    pickLang = defaultPickLang,
  } = {}) {
    const session = await createUserSession({ userId: user?._id, req });

    if (session?.conflict) {
      await writeAuthEvent({
        user: user?._id,
        email: user?.email,
        eventType: 'login_failed',
        result: 'failed',
        reason: 'single_device_conflict',
        req,
      });

      return {
        ok: false,
        reason: 'single_device_conflict',
        session,
      };
    }

    const sessionId = session?.session_id || session?.sessionId || '';

    if (!sessionId) {
      return {
        ok: false,
        reason: 'missing_session_id',
        session,
      };
    }

    const token = generateToken({ userId: user?._id, email: user?.email, sid: sessionId });
    const refreshedUserRow = await repairDamagedUserData((await getUserRowById(user?._id)) || userRow);
    const safeUser = await buildSafeUserWithEntity(refreshedUserRow || userRow);

    await writeAuthEvent({
      user: user?._id,
      email: user?.email,
      eventType: 'login_success',
      result: 'success',
      reason: null,
      req,
      sessionId,
    });

    await settleLoginReferralReward({
      dailyLimit,
      lang,
      pickLang,
      user,
    });

    return {
      ok: true,
      safeUser,
      session,
      sessionId,
      token,
    };
  }

  return {
    openLoginSession,
  };
}

module.exports = {
  ...createAuthLoginSession(),
  createAuthLoginSession,
};
