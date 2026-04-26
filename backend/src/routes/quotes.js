const express = require('express');
const router = express.Router();
const quoteController = require('../controllers/quoteController');
const auth = require('../middleware/auth');
const admin = require('../middleware/adminAuth');

// Public route - get active quote
router.get('/active', quoteController.getActiveQuote);

// Admin routes
router.get('/', auth, admin, quoteController.getAllQuotes);
router.post('/', auth, admin, quoteController.createQuote);
router.patch('/:id', auth, admin, quoteController.updateQuote);
router.delete('/:id', auth, admin, quoteController.deleteQuote);

module.exports = router;
