const {
  normalizeEmailInput: defaultNormalizeEmailInput,
} = require('./authHelpers');
const {
  buildLoginSignalContext: defaultBuildLoginSignalContext,
} = require('./authClientSignals');
const {
  prepareLoginAccess: defaultPrepareLoginAccess,
} = require('./authLoginAccess');
const {
  recordLoginRuntimeState: defaultRecordLoginRuntimeState,
} = require('./authLoginRuntime');
const {
  openLoginSession: defaultOpenLoginSession,
} = require('./authLoginSession');
const {
  extractClientMeta: defaultExtractClientMeta,
} = require('../authTrackingService');

function createAuthLoginFlow({
  buildLoginSignalContext = defaultBuildLoginSignalContext,
  extractClientMeta = defaultExtractClientMeta,
  normalizeEmailInput = defaultNormalizeEmailInput,
  openLoginSession = defaultOpenLoginSession,
  prepareLoginAccess = defaultPrepareLoginAccess,
  recordLoginRuntimeState = defaultRecordLoginRuntimeState,
} = {}) {
  async function loginAuthUser({
    dailyLimit,
    lang,
    pickLang,
    req,
  } = {}) {
    const client = extractClientMeta(req);
    const email = normalizeEmailInput(req?.body?.email);
    const seedPhrase = String(req?.body?.seedPhrase || '');

    const loginSignalContext = await buildLoginSignalContext({ client, email });
    const loginIpIntel = loginSignalContext.ipIntel;

    const loginAccess = await prepareLoginAccess({
      client,
      email,
      seedPhrase,
      req,
    });

    if (!loginAccess.ok) {
      return {
        ...loginAccess,
        ok: false,
        stage: 'access',
      };
    }

    const { user, userRow } = loginAccess;
    const {
      multiAccountResult,
    } = await recordLoginRuntimeState({
      user,
      userRow,
      client,
      loginSignalContext,
      loginIpIntel,
      req,
    });

    if (multiAccountResult?.frozen) {
      return {
        ok: false,
        reason: 'multi_account_frozen_after_login',
        groupId: multiAccountResult.groupId,
        multiAccountResult,
        stage: 'runtime',
      };
    }

    const loginSession = await openLoginSession({
      user,
      userRow,
      req,
      dailyLimit,
      lang,
      pickLang,
    });

    if (loginSession?.reason) {
      return {
        ...loginSession,
        ok: false,
        stage: 'session',
      };
    }

    return {
      ok: true,
      safeUser: loginSession.safeUser,
      token: loginSession.token,
    };
  }

  return {
    loginAuthUser,
  };
}

module.exports = {
  ...createAuthLoginFlow(),
  createAuthLoginFlow,
};
