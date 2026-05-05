'use strict';

const router = require('express').Router();
const { verifyToken } = require('../middleware/auth');
const { register, login, logout, me, changePassword } = require('../controllers/authController');

router.post('/register', register);
router.post('/login', login);
router.post('/logout', logout);
router.get('/me', verifyToken, me);
router.post('/change-password', verifyToken, changePassword);

module.exports = router;
