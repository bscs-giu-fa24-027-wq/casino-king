'use strict';

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { deposit, stripeWebhook } = require('../controllers/paymentController');

// Stripe webhook needs raw body — must be registered before express.json()
// We handle it here with express.raw() specifically for this route
router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  stripeWebhook
);

router.post('/deposit', authenticate, deposit);

module.exports = router;
