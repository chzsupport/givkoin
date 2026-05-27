const { getSupabaseClient } = require('../../lib/supabaseClient');
const {
  buildFreezeGroupId,
  buildUserDataWithFreeze,
  getSecurityFreeze,
} = require('./freezeState');
const {
  getUserData,
  uniqueUsers,
} = require('./userRows');

const MULTI_ACCOUNT_FROZEN_REASON = 'multi_account_group_frozen';
const MULTI_ACCOUNT_FROZEN_STATUS = 'frozen';

function cleanText(value) {
  return String(value || '').trim();
}

async function revokeAllUserSessionsDefault(payload) {
  const { revokeAllUserSessions } = require('../authTrackingService');
  return revokeAllUserSessions(payload);
}

function createFreezeActions(deps = {}) {
  const getClient = deps.getSupabaseClient || getSupabaseClient;
  const revokeSessions = deps.revokeAllUserSessions || revokeAllUserSessionsDefault;
  const now = typeof deps.now === 'function' ? deps.now : () => new Date();

  async function updateUsersForFreeze(users = [], {
    groupId,
    reason,
    actorId = null,
    note = '',
    action = 'freeze',
  } = {}) {
    const supabase = getClient();
    const safeUsers = uniqueUsers(users);
    if (!safeUsers.length) return null;

    const nowIso = now().toISOString();
    const resolvedGroupId = cleanText(groupId) || buildFreezeGroupId(safeUsers);

    for (const user of safeUsers) {
      const currentData = getUserData(user);
      const currentFreeze = getSecurityFreeze(currentData);
      const update = {
        updated_at: nowIso,
        access_restricted_until: null,
        access_restriction_reason: action === 'freeze' ? MULTI_ACCOUNT_FROZEN_REASON : '',
      };

      if (action === 'freeze') {
        update.status = MULTI_ACCOUNT_FROZEN_STATUS;
        update.data = buildUserDataWithFreeze(user, {
          status: 'frozen',
          groupId: resolvedGroupId,
          reason: cleanText(reason) || MULTI_ACCOUNT_FROZEN_REASON,
          frozenAt: nowIso,
          frozenBy: actorId || null,
          previousStatus: cleanText(currentFreeze.previousStatus || user.status || 'active') || 'active',
          note: cleanText(note),
          decision: 'pending',
        });
      }

      if (action === 'unfreeze') {
        const previousStatus = cleanText(currentFreeze.previousStatus || currentData.previousStatus || '');
        update.status = previousStatus || (user.emailConfirmed ? 'active' : 'pending');
        update.data = buildUserDataWithFreeze(user, {
          status: 'unfrozen',
          groupId: cleanText(currentFreeze.groupId || resolvedGroupId),
          unfrozenAt: nowIso,
          unfrozenBy: actorId || null,
          reason: cleanText(reason) || currentFreeze.reason || MULTI_ACCOUNT_FROZEN_REASON,
          note: cleanText(note),
          decision: 'unfreeze',
        });
      }

      if (action === 'watch') {
        const previousStatus = cleanText(currentFreeze.previousStatus || currentData.previousStatus || '');
        update.status = previousStatus || (user.emailConfirmed ? 'active' : 'pending');
        update.data = buildUserDataWithFreeze(user, {
          status: 'watch',
          groupId: cleanText(currentFreeze.groupId || resolvedGroupId),
          watchAt: nowIso,
          watchBy: actorId || null,
          reason: cleanText(reason) || currentFreeze.reason || MULTI_ACCOUNT_FROZEN_REASON,
          note: cleanText(note),
          decision: 'watch',
        });
      }

      if (action === 'ban') {
        update.status = 'banned';
        update.data = buildUserDataWithFreeze(user, {
          status: 'banned',
          groupId: cleanText(currentFreeze.groupId || resolvedGroupId),
          bannedAt: nowIso,
          bannedBy: actorId || null,
          reason: cleanText(reason) || currentFreeze.reason || MULTI_ACCOUNT_FROZEN_REASON,
          note: cleanText(note),
          decision: 'ban',
        });
      }

      // eslint-disable-next-line no-await-in-loop
      await supabase
        .from('users')
        .update(update)
        .eq('id', String(user._id));

      if (action === 'freeze' || action === 'ban') {
        // eslint-disable-next-line no-await-in-loop
        await revokeSessions({
          userId: user._id,
          revokedBy: actorId || null,
          reason: action === 'ban' ? 'multi_account_group_banned' : 'multi_account_group_frozen',
        });
      }
    }

    return resolvedGroupId;
  }

  return {
    updateUsersForFreeze,
  };
}

module.exports = {
  ...createFreezeActions(),
  createFreezeActions,
};
