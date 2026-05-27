const bcrypt = require('bcryptjs');

const { getSupabaseClient: defaultGetSupabaseClient } = require('../../lib/supabaseClient');
const { isAdminEmail: defaultIsAdminEmail } = require('../../utils/accountRole');
const { isHumanCheckBlocked: defaultIsHumanCheckBlocked } = require('../humanCheckService');
const {
  evaluateAccessRestriction: defaultEvaluateAccessRestriction,
  isActiveRestriction: defaultIsActiveRestriction,
  isUserFrozen: defaultIsUserFrozen,
} = require('../multiAccountService');
const { getUserRowByEmail: defaultGetUserRowByEmail } = require('./authReferralStore');
const { buildSafeUserFromRow: defaultBuildSafeUserFromRow } = require('./authUserPayload');
const { writeAuthEvent: defaultWriteAuthEvent } = require('../authTrackingService');

function createAuthLoginAccess({
  buildSafeUserFromRow = defaultBuildSafeUserFromRow,
  compareSeedPhrase = bcrypt.compare,
  evaluateAccessRestriction = defaultEvaluateAccessRestriction,
  getSupabaseClient = defaultGetSupabaseClient,
  getUserRowByEmail = defaultGetUserRowByEmail,
  isActiveRestriction = defaultIsActiveRestriction,
  isAdminEmail = defaultIsAdminEmail,
  isHumanCheckBlocked = defaultIsHumanCheckBlocked,
  isUserFrozen = defaultIsUserFrozen,
  now = () => new Date(),
  writeAuthEvent = defaultWriteAuthEvent,
} = {}) {
  async function writeLoginFailure({ user, email, reason, req, eventType = 'login_failed', meta } = {}) {
    await writeAuthEvent({
      user: user?._id || null,
      email,
      eventType,
      result: 'failed',
      reason,
      req,
      ...(meta ? { meta } : {}),
    });
  }

  async function clearExpiredAccessRestriction(user) {
    await getSupabaseClient()
      .from('users')
      .update({
        access_restricted_until: null,
        access_restriction_reason: '',
        updated_at: new Date(now()).toISOString(),
      })
      .eq('id', String(user?._id));
  }

  async function prepareLoginAccess({
    client,
    email,
    seedPhrase,
    req,
  } = {}) {
    const userRow = await getUserRowByEmail(email);

    if (!userRow) {
      await writeLoginFailure({
        email,
        reason: 'user_not_found',
        req,
      });

      return {
        ok: false,
        reason: 'user_not_found',
        status: 401,
      };
    }

    const user = buildSafeUserFromRow(userRow);
    const isAdminAccount = user?.role === 'admin';

    if (isAdminAccount && !isAdminEmail(user.email)) {
      await writeLoginFailure({
        user,
        email,
        reason: 'admin_email_policy_violation',
        req,
      });

      return {
        ok: false,
        reason: 'admin_email_policy_violation',
        status: 403,
        user,
        userRow,
      };
    }

    const accessCheck = await evaluateAccessRestriction(client);

    if (accessCheck.blocked && !isAdminAccount) {
      await writeLoginFailure({
        user,
        email,
        reason: `blocked:${accessCheck.reason || 'rule'}`,
        req,
      });

      return {
        ok: false,
        reason: 'access_blocked',
        status: 403,
        user,
        userRow,
      };
    }

    const frozen = isUserFrozen(user);
    const activeRestriction = isActiveRestriction(user.accessRestrictedUntil);

    if (!isAdminAccount && (activeRestriction || frozen)) {
      const reason = frozen ? 'multi_account_group_frozen' : 'temporary_restriction_active';

      await writeLoginFailure({
        user,
        email,
        eventType: 'multi_account_detected',
        reason,
        req,
        meta: {
          restrictedUntil: user.accessRestrictedUntil,
          restrictionReason: user.accessRestrictionReason || '',
        },
      });

      return {
        ok: false,
        blockedUntil: user.accessRestrictedUntil,
        reason,
        status: 403,
        user,
        userRow,
      };
    }

    if (user.accessRestrictedUntil && (!activeRestriction || isAdminAccount)) {
      await clearExpiredAccessRestriction(user);
    }

    const passwordMatch = await compareSeedPhrase(String(seedPhrase || ''), String(userRow.password_hash || ''));

    if (!passwordMatch) {
      await writeLoginFailure({
        user,
        email,
        reason: 'bad_credentials',
        req,
      });

      return {
        ok: false,
        reason: 'bad_credentials',
        status: 401,
        user,
        userRow,
      };
    }

    if (!user.emailConfirmed) {
      await writeLoginFailure({
        user,
        email,
        reason: 'email_not_confirmed',
        req,
      });

      return {
        ok: false,
        reason: 'email_not_confirmed',
        status: 403,
        user,
        userRow,
      };
    }

    if (user.status === 'banned') {
      await writeLoginFailure({
        user,
        email,
        reason: 'user_banned',
        req,
      });

      return {
        ok: false,
        reason: 'user_banned',
        status: 403,
        user,
        userRow,
      };
    }

    const humanCheckBlock = isHumanCheckBlocked(user);

    if (!isAdminAccount && humanCheckBlock.blocked) {
      await writeLoginFailure({
        user,
        email,
        reason: 'human_check_blocked',
        req,
        meta: {
          blockedUntil: humanCheckBlock.blockedUntil,
        },
      });

      return {
        ok: false,
        blockedUntil: humanCheckBlock.blockedUntil,
        humanCheckBlocked: true,
        reason: 'human_check_blocked',
        status: 403,
        user,
        userRow,
      };
    }

    return {
      isAdminAccount,
      ok: true,
      user,
      userRow,
    };
  }

  return {
    prepareLoginAccess,
  };
}

module.exports = {
  ...createAuthLoginAccess(),
  createAuthLoginAccess,
};
