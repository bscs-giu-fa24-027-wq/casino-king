'use strict';

const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { redeem, listMyBonuses, streak } = require('../controllers/bonusController');

router.use(authenticate);

router.get('/', listMyBonuses);
router.get('/streak', streak);
router.post('/redeem', redeem);

module.exports = router;
