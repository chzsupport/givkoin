const express = require('express');
const auth = require('../middleware/auth');
const {
  createWish,
  listWishes,
  supportWish,
  takeForFulfillment,
  markFulfilled,
  getStats,
} = require('../controllers/wishController');

const router = express.Router();

router.get('/', auth, listWishes);
router.get('/stats', auth, getStats);
router.post('/', auth, createWish);
router.post('/:id/support', auth, supportWish);
router.post('/:id/fulfill', auth, takeForFulfillment);
router.post('/:id/mark-fulfilled', auth, markFulfilled);

module.exports = router;
