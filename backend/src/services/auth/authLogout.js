const { getSupabaseClient: defaultGetSupabaseClient } = require('../../lib/supabaseClient');
const {
  decodeTokenUnsafe: defaultDecodeTokenUnsafe,
  getTokenFromRequest: defaultGetTokenFromRequest,
  revokeSession: defaultRevokeSession,
  writeAuthEvent: defaultWriteAuthEvent,
} = require('../authTrackingService');
const { getUserRowById: defaultGetUserRowById } = require('./authUserStore');

function createAuthLogout({
  decodeTokenUnsafe = defaultDecodeTokenUnsafe,
  getSupabaseClient = defaultGetSupabaseClient,
  getTokenFromRequest = defaultGetTokenFromRequest,
  getUserRowById = defaultGetUserRowById,
  now = () => new Date(),
  revokeSession = defaultRevokeSession,
  writeAuthEvent = defaultWriteAuthEvent,
} = {}) {
  function readLogoutSessionId(req) {
    const authToken = getTokenFromRequest(req);
    const unsafeDecoded = decodeTokenUnsafe(authToken);

    return req?.auth?.sid || unsafeDecoded?.sid || '';
  }

  async function performLogout({ req } = {}) {
    const row = await getUserRowById(req?.user?._id);

    if (!row) {
      return { ok: false, reason: 'not_found' };
    }

    const sessionId = readLogoutSessionId(req);

    if (sessionId) {
      await revokeSession({
        sessionId,
        revokedBy: row.id,
        reason: 'logout',
      });
    }

    const nowIso = new Date(now()).toISOString();
    const existingData = row.data && typeof row.data === 'object' ? row.data : {};

    await getSupabaseClient()
      .from('users')
      .update({
        updated_at: nowIso,
        data: {
          ...existingData,
          lastLogoutAt: nowIso,
        },
      })
      .eq('id', String(row.id));

    await writeAuthEvent({
      user: row.id,
      email: row.email,
      eventType: 'logout',
      result: 'success',
      req,
      sessionId,
    });

    return {
      ok: true,
      row,
      sessionId,
    };
  }

  return {
    performLogout,
    readLogoutSessionId,
  };
}

module.exports = {
  ...createAuthLogout(),
  createAuthLogout,
};
