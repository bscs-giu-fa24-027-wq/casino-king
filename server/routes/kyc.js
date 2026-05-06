'use strict';

const router = require('express').Router();
const { verifyToken, requireAdmin } = require('../middleware/auth');
const { submitKyc, getKycStatus, reviewKyc } = require('../controllers/kycController');

router.post('/submit', verifyToken, submitKyc);
router.get('/status', verifyToken, getKycStatus);
router.patch('/:userId/review', verifyToken, requireAdmin, reviewKyc);

module.exports = router;
