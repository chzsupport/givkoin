const express = require('express');
const chronicleController = require('../controllers/chronicleController');

const router = express.Router();

router.get('/latest', chronicleController.getLatest);
router.get('/', chronicleController.list);

module.exports = router;
