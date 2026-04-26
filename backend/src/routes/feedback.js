const express = require('express');
const router = express.Router();
const feedbackController = require('../controllers/feedbackController');
const optionalAuth = require('../middleware/optionalAuth');
const { createRateLimiter, buildUserOrIpKey } = require('../middleware/rateLimit');

const feedbackRateLimit = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyBuilder: buildUserOrIpKey,
  scope: 'POST:/feedback',
  message: 'Слишком много обращений. Подождите немного перед следующей отправкой.',
});

router.post('/', optionalAuth, feedbackRateLimit, feedbackController.createFeedback);

module.exports = router;
