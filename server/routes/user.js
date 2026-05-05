'use strict';

const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { getMe, updateMe } = require('../controllers/userController');

router.use(authenticate);

router.get('/me', getMe);
router.patch('/me', updateMe);

module.exports = router;
