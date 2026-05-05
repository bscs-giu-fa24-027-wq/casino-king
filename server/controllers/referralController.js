'use strict';

const { createReferral, getReferrals } = require('../services/referralService');

/**
 * POST /api/referrals
 * Body: { referredId }
 */
async function refer(req, res, next) {
  try {
    const { referredId } = req.body;
    if (!referredId) return res.status(400).json({ error: 'referredId is required' });

    const referral = await createReferral(req.user.id, referredId);
    res.status(201).json(referral);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/referrals
 */
async function listReferrals(req, res, next) {
  try {
    const referrals = await getReferrals(req.user.id);
    res.json(referrals);
  } catch (err) {
    next(err);
  }
}

module.exports = { refer, listReferrals };
