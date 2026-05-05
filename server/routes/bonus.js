'use strict';

const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { redeem, listMyBonuses } = require('../controllers/bonusController');

router.use(authenticate);

router.get('/', listMyBonuses);
router.post('/redeem', redeem);

module.exports = router;
