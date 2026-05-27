const { getSupabaseClient: defaultGetSupabaseClient } = require('../../lib/supabaseClient');
const {
  handlePostLoginMultiAccount: defaultHandlePostLoginMultiAccount,
  recordSignalHistory: defaultRecordSignalHistory,
} = require('../multiAccountService');

function createAuthLoginRuntime({
  getSupabaseClient = defaultGetSupabaseClient,
  handlePostLoginMultiAccount = defaultHandlePostLoginMultiAccount,
  now = () => new Date(),
  recordSignalHistory = defaultRecordSignalHistory,
} = {}) {
  async function recordLoginRuntimeState({
    user,
    userRow,
    client,
    loginSignalContext,
    loginIpIntel,
    req,
  } = {}) {
    const loginSignals = loginSignalContext?.signals || {};
    const userRuntimeData = userRow?.data && typeof userRow.data === 'object' ? userRow.data : {};
    const nowIso = new Date(now()).toISOString();

    await getSupabaseClient()
      .from('users')
      .update({
        last_online_at: nowIso,
        last_ip: client?.ip || user?.lastIp || null,
        last_device_id: client?.deviceId || user?.lastDeviceId || null,
        last_fingerprint: client?.fingerprint || user?.lastFingerprint || null,
        data: {
          ...userRuntimeData,
          lastWeakFingerprint: client?.weakFingerprint || userRuntimeData.lastWeakFingerprint || '',
          lastProfileKey: loginSignalContext?.profileKey || userRuntimeData.lastProfileKey || '',
          lastClientProfile: loginSignalContext?.clientProfile
            ? loginSignalContext.clientProfile
            : (userRuntimeData.lastClientProfile || null),
          lastIpIntel: loginIpIntel || userRuntimeData.lastIpIntel || null,
        },
        updated_at: nowIso,
      })
      .eq('id', String(user?._id));

    await recordSignalHistory({
      userId: user?._id,
      eventType: 'login',
      signals: loginSignals,
      ipIntel: loginIpIntel,
      meta: {
        source: 'auth_login',
        profileKey: loginSignalContext?.profileKey,
        clientProfile: loginSignalContext?.clientProfile,
      },
    });

    const multiAccountResult = await handlePostLoginMultiAccount({
      user,
      req,
      signals: loginSignals,
    });

    return {
      loginSignals,
      multiAccountResult,
    };
  }

  return {
    recordLoginRuntimeState,
  };
}

module.exports = {
  ...createAuthLoginRuntime(),
  createAuthLoginRuntime,
};
