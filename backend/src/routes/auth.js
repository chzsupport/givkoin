const express = require('express');
const { body, query } = require('express-validator');
const authController = require('../controllers/authController');
const validation = require('../middleware/validation');

const auth = require('../middleware/auth');
const {
  USER_EMAIL_DOMAINS,
  isAllowedLoginEmail,
  isAllowedUserEmail,
} = require('../utils/accountRole');

const router = express.Router();

router.get('/me', auth, authController.getMe);
router.post('/logout', auth, authController.logout);

const allowedLanguages = [
  'af',
  'sq',
  'am',
  'ar',
  'hy',
  'az',
  'eu',
  'be',
  'bn',
  'bs',
  'bg',
  'my',
  'ca',
  'ceb',
  'zh-Hans',
  'zh-Hant',
  'co',
  'hr',
  'cs',
  'da',
  'nl',
  'en',
  'eo',
  'et',
  'fi',
  'fr',
  'fy',
  'gl',
  'ka',
  'de',
  'el',
  'gu',
  'ht',
  'ha',
  'haw',
  'he',
  'hi',
  'hmn',
  'hu',
  'is',
  'ig',
  'id',
  'ga',
  'it',
  'ja',
  'jv',
  'kn',
  'kk',
  'km',
  'rw',
  'ko',
  'ku',
  'ky',
  'lo',
  'la',
  'lv',
  'lt',
  'lb',
  'mk',
  'mg',
  'ms',
  'ml',
  'mt',
  'mi',
  'mr',
  'mn',
  'ne',
  'no',
  'or',
  'om',
  'ps',
  'fa',
  'pl',
  'pt',
  'pa',
  'ro',
  'ru',
  'sm',
  'sa',
  'gd',
  'sr',
  'st',
  'sn',
  'sd',
  'si',
  'sk',
  'sl',
  'so',
  'es',
  'su',
  'sw',
  'sv',
  'tl',
  'tg',
  'ta',
  'tt',
  'te',
  'th',
  'bo',
  'ti',
  'tr',
  'tk',
  'uk',
  'ur',
  'ug',
  'uz',
  'vi',
  'cy',
  'xh',
  'yi',
  'yo',
  'zu',
];

const disposableDomains = new Set([
  '10minutemail.com',
  'guerrillamail.com',
  'mailinator.com',
  'temp-mail.org',
  'tempmail.com',
  'yopmail.com',
]);

const emailValidator = body('email')
  .isEmail()
  .withMessage('Некорректный email')
  .custom((value) => {
    const [, domain] = String(value || '').toLowerCase().split('@');
    if (!isAllowedUserEmail(value)) {
      throw new Error(`Допустимы только домены ${USER_EMAIL_DOMAINS.join(', ')}`);
    }
    if (disposableDomains.has(domain)) {
      throw new Error('Временные почты запрещены');
    }
    return true;
  });

const loginEmailValidator = body('email')
  .isEmail()
  .withMessage('Некорректный email')
  .custom((value) => {
    if (!isAllowedLoginEmail(value)) {
      throw new Error(`Допустимы только домены ${USER_EMAIL_DOMAINS.join(', ')} и служебные админ-почты`);
    }
    return true;
  });

const seedPhraseValidator = body('seedPhrase')
  .notEmpty()
  .withMessage('Введите сид-фразу')
  .isString()
  .withMessage('Сид-фраза должна быть строкой')
  .custom((value) => {
    const s = String(value || '').trim();
    const words = s.split(/\s+/).filter(Boolean);
    if (words.length !== 24) {
      throw new Error('Сид-фраза должна содержать 24 слова');
    }
    return true;
  });

router.post(
  '/register',
  [
    body('nickname').isLength({ min: 2, max: 30 }).withMessage('Укажите ник (2-30 символов)'),
    body('gender').isIn(['male', 'female', 'other']).withMessage('Некорректный пол'),
    body('preferredGender').isIn(['male', 'female', 'any', 'other']).withMessage('Некорректный пол собеседника'),
    body('language').isIn(allowedLanguages).withMessage('Некорректный язык'),
    body('birthDate').optional().isISO8601().withMessage('Некорректная дата рождения'),
    body('preferredAgeFrom')
      .optional()
      .isInt({ min: 18, max: 99 })
      .withMessage('Возраст от 18 до 99'),
    body('preferredAgeTo')
      .optional()
      .isInt({ min: 18, max: 99 })
      .withMessage('Возраст от 18 до 99')
      .custom((value, { req }) => {
        if (req.body.preferredAgeFrom && value < req.body.preferredAgeFrom) {
          throw new Error('Возраст «до» не может быть меньше «от»');
        }
        return true;
      }),
    emailValidator,
    body('acceptRules')
      .custom((value) => value === true || value === 'true')
      .withMessage('Необходимо принять правила GIVKOIN'),
  ],
  validation,
  authController.register
);

router.post(
  '/login',
  [loginEmailValidator, seedPhraseValidator],
  validation,
  authController.login
);

router.get(
  '/confirm',
  [query('token').notEmpty().withMessage('Токен обязателен')],
  validation,
  authController.confirmEmail
);

router.post(
  '/forgot-password',
  [emailValidator],
  validation,
  authController.forgotPassword
);

router.post(
  '/reset-password',
  [
    body('token').notEmpty().withMessage('Токен обязателен'),
    seedPhraseValidator,
    body('confirmSeedPhrase')
      .custom((value, { req }) => value === req.body.seedPhrase)
      .withMessage('Сид-фразы не совпадают'),
  ],
  validation,
  authController.resetPassword
);

router.patch(
  '/profile',
  auth,
  [body('language').optional().isIn(allowedLanguages).withMessage('Некорректный язык')],
  validation,
  authController.updateProfile
);

module.exports = router;

