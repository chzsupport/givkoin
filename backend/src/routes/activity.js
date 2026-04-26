const express = require('express');
const auth = require('../middleware/auth');
const { recordPageView, recordLeave, recordBehavior } = require('../controllers/activityController');
const { createRateLimiter, buildUserOrIpKey } = require('../middleware/rateLimit');

const router = express.Router();

const pageViewRateLimit = createRateLimiter({
  windowMs: 60 * 1000,
  max: 180,
  keyBuilder: buildUserOrIpKey,
  scope: 'POST:/activity/page-view',
  message: 'Слишком много событий просмотра страницы. Подождите немного.',
});
const behaviorRateLimit = createRateLimiter({
  windowMs: 60 * 1000,
  max: 240,
  keyBuilder: buildUserOrIpKey,
  scope: 'POST:/activity/behavior',
  message: 'Слишком много поведенческих событий. Подождите немного.',
});
const leaveRateLimit = createRateLimiter({
  windowMs: 60 * 1000,
  max: 60,
  keyBuilder: buildUserOrIpKey,
  scope: 'POST:/activity/leave',
  message: 'Слишком много событий выхода. Подождите немного.',
});

router.post('/page-view', auth, pageViewRateLimit, recordPageView);
router.post('/behavior', auth, behaviorRateLimit, recordBehavior);
router.post('/leave', auth, leaveRateLimit, recordLeave);

module.exports = router;
