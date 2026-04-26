const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const authMiddleware = require('../middleware/auth'); // Assuming this exists
const { createRateLimiter, buildUserOrIpKey } = require('../middleware/rateLimit');

const chatMessageRateLimit = createRateLimiter({
  windowMs: 10 * 1000,
  max: 12,
  keyBuilder: buildUserOrIpKey,
  scope: 'POST:/chats/:chatId/messages',
  message: 'Слишком частая отправка сообщений. Подождите немного.',
});
const chatComplaintRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 3,
  keyBuilder: buildUserOrIpKey,
  scope: 'POST:/chats/:chatId/complaint',
  message: 'Слишком много жалоб за короткое время. Подождите немного.',
});
const chatAppealRateLimit = createRateLimiter({
  windowMs: 30 * 60 * 1000,
  max: 2,
  keyBuilder: buildUserOrIpKey,
  scope: 'POST:/chats/:chatId/appeal',
  message: 'Слишком много апелляций за короткое время. Подождите позже.',
});

router.use(authMiddleware);

router.get('/active', chatController.getActiveChat);
router.get('/history', chatController.getChatHistory);
router.get('/:chatId', chatController.getChatDetails);
router.get('/:chatId/messages', chatController.getChatMessages);
router.post('/:chatId/messages', chatMessageRateLimit, chatController.sendChatMessage);
router.post('/:chatId/complaint', chatComplaintRateLimit, chatController.submitComplaint);
router.post('/:chatId/delete', chatController.deleteChat);
router.post('/:chatId/appeal', chatAppealRateLimit, chatController.appealChat);

module.exports = router;
