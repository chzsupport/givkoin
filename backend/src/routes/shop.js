const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const shopController = require('../controllers/shopController');

router.get('/catalog', auth, shopController.getCatalog);
router.post('/buy', auth, shopController.buyItem);

module.exports = router;
