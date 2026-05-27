const bcrypt = require('bcryptjs');

const { getSupabaseClient: defaultGetSupabaseClient } = require('../../lib/supabaseClient');
const { isAllowedUserEmail: defaultIsAllowedUserEmail } = require('../../utils/accountRole');
const { assignBranchForNewUser: defaultAssignBranchForNewUser } = require('../branchAllocationService');
const {
  checkRegistrationAllowance: defaultCheckRegistrationAllowance,
  evaluateAccessRestriction: defaultEvaluateAccessRestriction,
  handlePostRegistrationMultiAccount: defaultHandlePostRegistrationMultiAccount,
  recordSignalHistory: defaultRecordSignalHistory,
} = require('../multiAccountService');
const {
  buildRegistrationSignalContext: defaultBuildRegistrationSignalContext,
} = require('./authClientSignals');
const {
  buildLocalizedFrontendUrl: defaultBuildLocalizedFrontendUrl,
  generateToken: defaultGenerateToken,
  generateUserId: defaultGenerateUserId,
  normalizeEmailInput: defaultNormalizeEmailInput,
} = require('./authHelpers');
const {
  getUserRowByEmail: defaultGetUserRowByEmail,
  getUserRowByNicknameCaseInsensitive: defaultGetUserRowByNicknameCaseInsensitive,
} = require('./authReferralStore');
const {
  createPendingReferralForNewUser: defaultCreatePendingReferralForNewUser,
  resolveRegistrationReferral: defaultResolveRegistrationReferral,
} = require('./authRegistrationReferral');
const { generateSeedPhrase24: defaultGenerateSeedPhrase24 } = require('./seedPhrase');
const { buildSafeUserFromRow: defaultBuildSafeUserFromRow } = require('./authUserPayload');
const { writeAuthEvent: defaultWriteAuthEvent } = require('../authTrackingService');

const defaultEmailService = {
  sendConfirmationEmail: (...args) => require('../emailService').sendConfirmationEmail(...args),
};
const defaultLogger = {
  error: (...args) => require('../../utils/logger').error(...args),
  info: (...args) => require('../../utils/logger').info(...args),
};

function createAuthRegistrationFlow({
  assignBranchForNewUser = defaultAssignBranchForNewUser,
  buildLocalizedFrontendUrl = defaultBuildLocalizedFrontendUrl,
  buildRegistrationSignalContext = defaultBuildRegistrationSignalContext,
  buildSafeUserFromRow = defaultBuildSafeUserFromRow,
  checkRegistrationAllowance = defaultCheckRegistrationAllowance,
  createPendingReferralForNewUser = defaultCreatePendingReferralForNewUser,
  emailService = defaultEmailService,
  evaluateAccessRestriction = defaultEvaluateAccessRestriction,
  generateSeedPhrase24 = defaultGenerateSeedPhrase24,
  generateToken = defaultGenerateToken,
  generateUserId = defaultGenerateUserId,
  getSupabaseClient = defaultGetSupabaseClient,
  getUserRowByEmail = defaultGetUserRowByEmail,
  getUserRowByNicknameCaseInsensitive = defaultGetUserRowByNicknameCaseInsensitive,
  handlePostRegistrationMultiAccount = defaultHandlePostRegistrationMultiAccount,
  hashSeedPhrase = async (seedPhrase) => {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(seedPhrase, salt);
  },
  isAllowedUserEmail = defaultIsAllowedUserEmail,
  logger = defaultLogger,
  normalizeEmailInput = defaultNormalizeEmailInput,
  now = () => new Date(),
  recordSignalHistory = defaultRecordSignalHistory,
  resolveRegistrationReferral = defaultResolveRegistrationReferral,
  writeAuthEvent = defaultWriteAuthEvent,
} = {}) {
  function sendConfirmationEmailAsync({ createdRow, confirmLink, lang }) {
    emailService
      .sendConfirmationEmail(createdRow.email, createdRow.nickname, confirmLink, lang)
      .then(() => {
        logger.info('[AUTH] Registration email queued/sent', {
          userId: createdRow.id,
          email: createdRow.email,
        });
      })
      .catch((error) => {
        logger.error('[AUTH] Registration email delivery failed', {
          userId: createdRow.id,
          email: createdRow.email,
          message: error?.message || 'unknown email error',
        });
      });
  }

  async function registerNewAuthUser({
    client,
    dailyLimit = 10,
    input = {},
    lang = 'ru',
    req,
  } = {}) {
    const accessCheck = await evaluateAccessRestriction(client);

    if (accessCheck.blocked) {
      await writeAuthEvent({
        user: null,
        email: normalizeEmailInput(input?.email),
        eventType: 'login_failed',
        result: 'failed',
        reason: `blocked:${accessCheck.reason || 'rule'}`,
        req,
      });

      return {
        ok: false,
        reason: 'access_blocked',
        status: 403,
      };
    }

    const {
      email,
      nickname,
      gender,
      birthDate,
      preferredGender,
      preferredAgeFrom,
      preferredAgeTo,
      referralCode,
      language,
    } = input;
    const normalizedEmail = normalizeEmailInput(email);

    if (!normalizedEmail) {
      return {
        ok: false,
        reason: 'invalid_email',
        status: 400,
      };
    }

    if (!isAllowedUserEmail(normalizedEmail)) {
      return {
        ok: false,
        reason: 'email_not_allowed',
        status: 400,
      };
    }

    const registrationSignalContext = await buildRegistrationSignalContext({
      client,
      req,
      email: normalizedEmail,
    });
    const inviteeIp = registrationSignalContext.ip;
    const inviteeDeviceId = registrationSignalContext.deviceId;
    const inviteeFingerprint = registrationSignalContext.fingerprint;
    const inviteeWeakFingerprint = registrationSignalContext.weakFingerprint;
    const inviteeIpIntel = registrationSignalContext.ipIntel;
    const registrationSignals = registrationSignalContext.signals;

    const registrationAllowance = await checkRegistrationAllowance({
      signals: registrationSignals,
      req,
      requestedEmail: normalizedEmail,
    });

    if (!registrationAllowance.allowed) {
      return {
        ok: false,
        blockedUntil: registrationAllowance.restrictedUntil,
        maxAllowed: registrationAllowance.maxAllowed,
        reason: 'registration_limit',
        status: 429,
      };
    }

    const existing = await getUserRowByEmail(normalizedEmail);

    if (existing) {
      return {
        ok: false,
        reason: 'email_exists',
        status: 400,
      };
    }

    const nick = String(nickname || '').trim();

    if (nick) {
      const existingNick = await getUserRowByNicknameCaseInsensitive(nick);

      if (existingNick) {
        return {
          ok: false,
          reason: 'nickname_exists',
          status: 400,
        };
      }
    }

    const {
      referredBy,
      referralOverflowFrom,
    } = await resolveRegistrationReferral({
      referralCode,
      dailyLimit,
    });
    const seedPhrase = generateSeedPhrase24();
    const passwordHash = await hashSeedPhrase(seedPhrase);
    const { treeCluster, treeBranch } = await assignBranchForNewUser({ birthDate });
    const nowIso = new Date(now()).toISOString();
    const userId = generateUserId();
    const userData = {
      gender,
      birthDate,
      treeCluster,
      treeBranch,
      preferredGender,
      preferredAgeFrom,
      preferredAgeTo,
      referredBy,
      lives: 0,
      complaintChips: 0,
      stars: 0,
      k: 0,
      lumens: 0,
      lastWeakFingerprint: inviteeWeakFingerprint || '',
      lastProfileKey: registrationSignalContext.profileKey,
      lastClientProfile: registrationSignalContext.clientProfile,
      lastIpIntel: inviteeIpIntel || null,
    };
    const { data: createdRow, error: createError } = await getSupabaseClient()
      .from('users')
      .insert({
        id: userId,
        email: normalizedEmail,
        password_hash: passwordHash,
        role: 'user',
        nickname,
        status: 'pending',
        email_confirmed: false,
        email_confirmed_at: null,
        access_restricted_until: null,
        access_restriction_reason: '',
        language: language || 'ru',
        data: userData,
        last_online_at: nowIso,
        last_ip: inviteeIp || null,
        last_device_id: inviteeDeviceId || null,
        last_fingerprint: inviteeFingerprint || null,
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select('*')
      .maybeSingle();

    if (createError || !createdRow) {
      return {
        ok: false,
        reason: 'create_failed',
        status: 400,
      };
    }

    await createPendingReferralForNewUser({
      referredBy,
      createdUserId: createdRow.id,
      inviteeIp,
      inviteeFingerprint,
      referralOverflowFrom,
    });

    await recordSignalHistory({
      userId: createdRow.id,
      eventType: 'register',
      signals: registrationSignals,
      ipIntel: inviteeIpIntel,
      meta: {
        source: 'auth_register',
        profileKey: registrationSignalContext.profileKey,
        clientProfile: registrationSignalContext.clientProfile,
      },
    });

    const multiAccountResult = await handlePostRegistrationMultiAccount({
      user: buildSafeUserFromRow(createdRow),
      req,
      signals: registrationSignals,
    });

    if (multiAccountResult.frozen) {
      return {
        ok: false,
        clusterSize: multiAccountResult.clusterSize,
        groupId: multiAccountResult.groupId,
        reason: 'multi_account_frozen',
        status: 403,
      };
    }

    const token = generateToken({ userId: createdRow.id, email: createdRow.email });
    const confirmLink = buildLocalizedFrontendUrl(lang, 'confirm', `token=${encodeURIComponent(token)}`);

    sendConfirmationEmailAsync({
      confirmLink,
      createdRow,
      lang,
    });

    return {
      confirmLink,
      createdRow,
      ok: true,
      seedPhrase,
    };
  }

  return {
    registerNewAuthUser,
    sendConfirmationEmailAsync,
  };
}

module.exports = {
  ...createAuthRegistrationFlow(),
  createAuthRegistrationFlow,
};
