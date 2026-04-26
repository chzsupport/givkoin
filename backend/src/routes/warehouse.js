const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const warehouseController = require('../controllers/warehouseController');

router.get('/', auth, warehouseController.list);
router.post('/use', auth, warehouseController.useItem);

module.exports = router;
