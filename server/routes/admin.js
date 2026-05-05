'use strict';

const router = require('express').Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const { listUsers, updateKyc, suspendUser } = require('../controllers/adminController');

router.use(authenticate, requireAdmin);

router.get('/users', listUsers);
router.patch('/users/:id/kyc', updateKyc);
router.patch('/users/:id/suspend', suspendUser);

module.exports = router;
