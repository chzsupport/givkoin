const jwt = require('jsonwebtoken');

const { normalizeLang, pickLang } = require('../services/auth/authHelpers');
const { registerNewAuthUser } = require('../services/auth/authRegistrationFlow');
const { getCurrentAuthUser } = require('../services/auth/authCurrentUser');
const { loginAuthUser } = require('../services/auth/authLoginFlow');
const { sendLoginErrorResponse } = require('./auth/authLoginResponse');
const {
  sendRegistrationDuplicateErrorResponse,
  sendRegistrationErrorResponse,
} = require('./auth/authRegistrationResponse');
const {
  sendHumanCheckBlockedResponse,
  sendHumanCheckExpiredResponse,
  sendHumanCheckFailResponse,
  sendHumanCheckStatusMissingResponse,
} = require('./auth/authHumanCheckResponse');
const {
  activateConfirmedEmail,
  findConfirmationUserRow,
} = require('../services/auth/authEmailConfirmation');
const {
  requestPasswordResetByEmail,
  resetPasswordWithToken,
} = require('../services/auth/authPasswordReset');
const { performLogout } = require('../services/auth/authLogout');
const { updateAuthProfile } = require('../services/auth/authProfileUpdate');
const {
  recordHumanCheckFail,
  recordHumanCheckPass,
} = require('../services/auth/authHumanCheckEvents');
const { extractClientMeta } = require('../services/authTrackingService');
const {
  completeHumanCheck,
  failHumanCheck,
  getHumanCheckStatus,
} = require('../services/humanCheckService');
const { JWT_SECRET, issueAuthCookie, clearAuthCookie } = require('../config/auth');
const { getRequestLanguage } = require('../utils/requestLanguage');

const REFERRAL_DAILY_LIMIT = 10;

const register = async (req, res, next) => {
  try {
    const requestedLang = normalizeLang(getRequestLanguage(req));
    const registrationResult = await registerNewAuthUser({
      client: extractClientMeta(req),
      dailyLimit: REFERRAL_DAILY_LIMIT,
      input: req.body || {},
      lang: requestedLang,
      req,
    });

    if (!registrationResult.ok) {
      return sendRegistrationErrorResponse({
        registrationResult,
        requestedLang,
        res,
      });
    }

    return res.status(201).json({
      message: pickLang(requestedLang, 'Спасибо! Подтверждение выслано на ваш Email', 'Thanks! Confirmation has been sent to your email'),
      confirmUrl: registrationResult.confirmLink,
      seedPhrase: registrationResult.seedPhrase,
    });
  } catch (error) {
    const requestedLang = normalizeLang(getRequestLanguage(req));
    const duplicateResponse = sendRegistrationDuplicateErrorResponse({
      error,
      requestedLang,
      res,
    });

    if (duplicateResponse) {
      return duplicateResponse;
    }

    return next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const requestedLang = normalizeLang(getRequestLanguage(req));
    const loginResult = await loginAuthUser({
      dailyLimit: REFERRAL_DAILY_LIMIT,
      lang: requestedLang,
      pickLang,
      req,
    });

    if (!loginResult.ok) {
      return sendLoginErrorResponse({
        clearAuthCookie,
        loginResult,
        requestedLang,
        res,
      });
    }

    issueAuthCookie(res, loginResult.token);
    return res.json({ user: loginResult.safeUser });
  } catch (error) {
    return next(error);
  }
};

const confirmEmail = async (req, res, next) => {
  try {
    const requestedLang = normalizeLang(getRequestLanguage(req));
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({
        message: pickLang(requestedLang, 'Токен подтверждения отсутствует', 'Confirmation token is missing'),
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const row = await findConfirmationUserRow(decoded);

    if (!row) {
      return res.status(404).json({
        message: pickLang(requestedLang, 'Пользователь не найден', 'User not found'),
      });
    }

    const lang = requestedLang;

    if (row.email_confirmed) {
      return res.json({
        message: pickLang(lang, 'Email уже подтверждён', 'Email is already confirmed'),
      });
    }

    await activateConfirmedEmail(row);
    return res.json({
      message: pickLang(lang, 'Регистрация завершена! Добро пожаловать', 'Registration completed! Welcome'),
    });
  } catch (error) {
    const requestedLang = normalizeLang(getRequestLanguage(req));

    if (error.name === 'TokenExpiredError' || error.name === 'JsonWebTokenError') {
      return res.status(400).json({
        message: pickLang(requestedLang, 'Некорректный или просроченный токен', 'Invalid or expired token'),
      });
    }

    return next(error);
  }
};

const getMe = async (req, res, next) => {
  try {
    const currentUser = await getCurrentAuthUser({ userId: req.user?._id });

    if (!currentUser.ok) {
      return res.status(404).json({
        message: pickLang(getRequestLanguage(req), 'Пользователь не найден', 'User not found'),
      });
    }

    return res.json({ user: currentUser.user });
  } catch (error) {
    return next(error);
  }
};

const logout = async (req, res, next) => {
  try {
    const logoutResult = await performLogout({ req });

    if (!logoutResult.ok) {
      return res.status(404).json({
        message: pickLang(getRequestLanguage(req), 'Пользователь не найден', 'User not found'),
      });
    }

    clearAuthCookie(res);
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
};

const humanCheckStatus = async (req, res, next) => {
  try {
    const result = await getHumanCheckStatus(req.user?._id);

    if (!result.ok) {
      return sendHumanCheckStatusMissingResponse({
        requestedLang: getRequestLanguage(req),
        result,
        res,
      });
    }

    return res.json(result);
  } catch (error) {
    return next(error);
  }
};

const humanCheckPass = async (req, res, next) => {
  try {
    const result = await completeHumanCheck({
      userId: req.user?._id,
      challengeId: req.body?.challengeId,
      variant: req.body?.variant,
    });

    if (!result.ok) {
      return sendHumanCheckExpiredResponse({
        requestedLang: getRequestLanguage(req),
        result,
        res,
      });
    }

    if (result.blocked) {
      return sendHumanCheckBlockedResponse({
        clearAuthCookie,
        requestedLang: getRequestLanguage(req),
        result,
        res,
      });
    }

    await recordHumanCheckPass({
      req,
      variant: req.body?.variant,
    });

    return res.json(result);
  } catch (error) {
    return next(error);
  }
};

const humanCheckFail = async (req, res, next) => {
  try {
    const result = await failHumanCheck({
      userId: req.user?._id,
      challengeId: req.body?.challengeId,
      variant: req.body?.variant,
    });

    if (!result.ok) {
      return sendHumanCheckExpiredResponse({
        requestedLang: getRequestLanguage(req),
        result,
        res,
      });
    }

    if (result.blocked || result.challengeFailed) {
      await recordHumanCheckFail({
        req,
        result,
        variant: req.body?.variant,
      });

      return sendHumanCheckFailResponse({
        clearAuthCookie,
        requestedLang: getRequestLanguage(req),
        result,
        res,
      });
    }

    await recordHumanCheckFail({
      req,
      result,
      variant: req.body?.variant,
    });

    return res.json(result);
  } catch (error) {
    return next(error);
  }
};

const updateProfile = async (req, res, next) => {
  try {
    const requestedLang = normalizeLang(getRequestLanguage(req));
    const {
      birthDate,
      gender,
      language,
      preferredAgeFrom,
      preferredAgeTo,
      preferredGender,
    } = req.body;

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'email')) {
      return res.status(400).json({
        message: pickLang(requestedLang, 'Смена почты из профиля отключена', 'Email change is disabled'),
      });
    }

    const updateResult = await updateAuthProfile({
      userId: req.user?._id,
      gender,
      birthDate,
      preferredGender,
      preferredAgeFrom,
      preferredAgeTo,
      language,
    });

    if (!updateResult.ok) {
      return res.status(404).json({
        message: pickLang(requestedLang, 'Пользователь не найден', 'User not found'),
      });
    }

    return res.json({
      message: pickLang(requestedLang, 'Профиль успешно обновлен', 'Profile updated successfully'),
      user: updateResult.user,
    });
  } catch (error) {
    return next(error);
  }
};

const forgotPassword = async (req, res, next) => {
  try {
    const requestedLang = normalizeLang(getRequestLanguage(req));
    const resetRequest = await requestPasswordResetByEmail({
      email: req.body?.email,
      language: requestedLang,
    });

    if (!resetRequest.ok) {
      return res.status(404).json({
        message: pickLang(requestedLang, 'Пользователь с таким email не найден', 'User with this email was not found'),
      });
    }

    return res.json({
      message: pickLang(requestedLang, 'Ссылка для сброса пароля отправлена на email', 'Password reset link has been sent to your email'),
    });
  } catch (error) {
    return next(error);
  }
};

const resetPassword = async (req, res, next) => {
  try {
    const { token, seedPhrase } = req.body;
    const requestedLang = normalizeLang(getRequestLanguage(req));

    if (!token) {
      return res.status(400).json({
        message: pickLang(requestedLang, 'Токен обязателен', 'Token is required'),
      });
    }

    const resetResult = await resetPasswordWithToken({ token, seedPhrase });

    if (!resetResult.ok) {
      return res.status(400).json({
        message: pickLang(requestedLang, 'Неверный или истекший токен сброса пароля', 'Invalid or expired password reset token'),
      });
    }

    return res.json({
      message: pickLang(requestedLang, 'Пароль успешно изменен. Теперь вы можете войти.', 'Password changed successfully. You can log in now.'),
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  register,
  login,
  confirmEmail,
  getMe,
  logout,
  humanCheckStatus,
  humanCheckPass,
  humanCheckFail,
  updateProfile,
  forgotPassword,
  resetPassword,
};
