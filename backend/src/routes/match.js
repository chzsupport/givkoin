const express = require('express');
const auth = require('../middleware/auth');
const matchController = require('../controllers/matchController');
const { createRateLimiter, buildUserOrIpKey } = require('../middleware/rateLimit');

const router = express.Router();

const findMatchRateLimit = createRateLimiter({
  windowMs: 60 * 1000,
  max: 10,
  keyBuilder: buildUserOrIpKey,
  scope: 'POST:/match/find',
  message: 'Слишком частый поиск пары. Подождите немного.',
});
const friendRequestRateLimit = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyBuilder: buildUserOrIpKey,
  scope: 'POST:/match/friends/request',
  message: 'Слишком много запросов в друзья. Подождите немного.',
});

router.post('/find', auth, findMatchRateLimit, matchController.findMatch);
router.post('/friends/request', auth, friendRequestRateLimit, matchController.sendFriendRequest);
router.post('/friends/accept', auth, matchController.acceptFriendRequest);
router.post('/friends/reject', auth, matchController.rejectFriendRequest);
router.post('/friends/remove', auth, matchController.removeFriend);
router.get('/friends/list', auth, matchController.getFriends);
router.get('/friends/requests', auth, matchController.getFriendRequests);
router.get('/block/list', auth, matchController.getBlockedUsers);
router.post('/block/unblock', auth, matchController.unblockUser);

// Для совместимости с текущим фронтендом (если он вызывает /friends/add)
// Но мы планируем обновить фронтенд. Оставим пока так.
// Если старый фронт зовет /friends/add, можно сделать алиас:
router.post('/friends/add', auth, friendRequestRateLimit, matchController.sendFriendRequest); // Alias for compatibility during migration

module.exports = router;
