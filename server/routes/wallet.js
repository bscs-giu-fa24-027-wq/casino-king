'use strict';

const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { getWallet, getTransactions } = require('../controllers/walletController');

router.use(authenticate);

router.get('/', getWallet);
router.get('/transactions', getTransactions);

module.exports = router;
