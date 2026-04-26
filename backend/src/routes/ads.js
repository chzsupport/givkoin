const express = require('express');
const router = express.Router();
const adController = require('../controllers/adController');
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');

const optionalAuth = require('../middleware/optionalAuth');
const { createRateLimiter, buildUserOrIpKey } = require('../middleware/rateLimit');

const impressionRateLimit = createRateLimiter({
  windowMs: 60 * 1000,
  max: 120,
  keyBuilder: buildUserOrIpKey,
  scope: 'POST:/ads/impression',
  message: 'Слишком много показов рекламы за короткое время. Подождите немного.',
});

// Public routes (for frontend to record impressions and get creatives)
router.post('/impression', optionalAuth, impressionRateLimit, adController.recordImpression);
router.get('/creative', adController.getActiveCreative);
router.get('/rotation', adController.getRotation);

// Admin routes
router.use(auth);
router.use(adminAuth);

router.get('/stats', adController.getStats);
router.get('/creatives', adController.getCreatives);
router.post('/creatives', adController.createCreative);
router.patch('/creatives/:id', adController.updateCreative);
router.delete('/creatives/:id', adController.deleteCreative);

module.exports = router;
