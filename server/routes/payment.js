'use strict';

const express = require('express');
const router = express.Router();
const { verifyToken, requireKyc } = require('../middleware/auth');
const { createCheckout, handleWebhook, cashout, getPaymentHistory } = require('../services/paymentService');

// POST /api/payments/webhook — raw body, NO auth middleware
// express.raw() is applied here so the router can receive the raw Buffer
// (index.js also mounts raw parser for this path before express.json())
router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res, next) => {
    try {
      const signature = req.headers['stripe-signature'];
      await handleWebhook(req.body, signature);
      res.json({ received: true });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/payments/create-checkout — requires JWT + KYC
router.post('/create-checkout', verifyToken, requireKyc, async (req, res, next) => {
  try {
    const { packageId } = req.body;
    if (!packageId) {
      return res.status(400).json({ error: 'packageId is required' });
    }
    const result = await createCheckout(req.user.id, packageId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/payments/cashout — requires JWT + KYC
router.post('/cashout', verifyToken, requireKyc, async (req, res, next) => {
  try {
    const { ckcAmount } = req.body;
    if (!ckcAmount) {
      return res.status(400).json({ error: 'ckcAmount is required' });
    }
    const result = await cashout(req.user.id, ckcAmount);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/payments/history — requires JWT
router.get('/history', verifyToken, async (req, res, next) => {
  try {
    const { limit, offset } = req.query;
    const result = await getPaymentHistory(req.user.id, { limit, offset });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
