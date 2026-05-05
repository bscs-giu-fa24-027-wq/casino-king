'use strict';

const { createDepositIntent, handleStripeWebhook } = require('../services/paymentService');

/**
 * POST /api/payments/deposit
 */
async function deposit(req, res, next) {
  try {
    const { amount } = req.body;
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'amount must be a positive number' });
    }

    const result = await createDepositIntent(req.user.id, parseFloat(amount));
    res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/payments/webhook
 * Stripe webhook endpoint — must receive raw body.
 */
async function stripeWebhook(req, res, next) {
  try {
    const signature = req.headers['stripe-signature'];
    await handleStripeWebhook(req.body, signature);
    res.json({ received: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { deposit, stripeWebhook };
