'use strict';

const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { refer, listReferrals } = require('../controllers/referralController');

router.use(authenticate);

router.get('/', listReferrals);
router.post('/', refer);

module.exports = router;
