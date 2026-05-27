const {
  notifyForcedLogout: defaultNotifyForcedLogout,
  revokeAllUserSessions: defaultRevokeAllUserSessions,
  writeAuthEvent: defaultWriteAuthEvent,
} = require('../authTrackingService');

function readAuthUser(req) {
  return {
    email: req?.user?.email || '',
    sessionId: req?.auth?.sid || '',
    userId: req?.user?._id,
  };
}

function createAuthHumanCheckEvents({
  notifyForcedLogout = defaultNotifyForcedLogout,
  revokeAllUserSessions = defaultRevokeAllUserSessions,
  writeAuthEvent = defaultWriteAuthEvent,
} = {}) {
  async function recordHumanCheckPass({ req, variant } = {}) {
    const { email, sessionId, userId } = readAuthUser(req);

    await writeAuthEvent({
      user: userId,
      email,
      eventType: 'human_check_passed',
      result: 'success',
      req,
      sessionId,
      meta: {
        variant: variant || '',
      },
    });
  }

  async function recordHumanCheckFail({ req, result, variant } = {}) {
    const { email, sessionId, userId } = readAuthUser(req);

    if (result?.blocked || result?.challengeFailed) {
      await revokeAllUserSessions({
        userId,
        revokedBy: userId,
        reason: 'human_check_failed',
      });

      notifyForcedLogout({
        userId,
        reason: 'human_check_failed',
      });

      await writeAuthEvent({
        user: userId,
        email,
        eventType: 'session_revoked',
        result: 'failed',
        reason: 'human_check_failed',
        req,
        sessionId,
        meta: {
          blockedUntil: result.blockedUntil,
          challengeFailed: Boolean(result.challengeFailed),
          variant: variant || '',
        },
      });

      return {
        revoked: true,
      };
    }

    await writeAuthEvent({
      user: userId,
      email,
      eventType: 'human_check_failed',
      result: 'failed',
      reason: 'attempt_failed',
      req,
      sessionId,
      meta: {
        attemptsLeft: result?.attemptsLeft,
        variant: variant || '',
      },
    });

    return {
      revoked: false,
    };
  }

  return {
    recordHumanCheckFail,
    recordHumanCheckPass,
  };
}

module.exports = {
  ...createAuthHumanCheckEvents(),
  createAuthHumanCheckEvents,
};
