'use strict';

const { generateReferralLink, claimReferral, getReferralStats, getReferrals } = require('../services/referralService');

/**
 * POST /api/referrals/generate
 * Requires JWT. Returns { referralLink, totalReferrals, totalCkcEarned }.
 */
async function generate(req, res, next) {
  try {
    const result = await generateReferralLink(req.user.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/referrals/claim
 * Called on register with ?ref=<referrerId>.
 * Body: { referrerId, referredId }
 */
async function claim(req, res, next) {
  try {
    const { referrerId, referredId } = req.body;
    if (!referrerId || !referredId) {
      return res.status(400).json({ error: 'referrerId and referredId are required' });
    }
    const referral = await claimReferral(referrerId, referredId);
    res.status(201).json(referral);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/referrals/stats
 * Requires JWT. Returns { referrals, totalCkcEarned }.
 */
async function stats(req, res, next) {
  try {
    const result = await getReferralStats(req.user.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/referrals  (legacy — kept for backward compatibility)
 * Body: { referredId }
 */
async function refer(req, res, next) {
  try {
    const { referredId } = req.body;
    if (!referredId) return res.status(400).json({ error: 'referredId is required' });
    const referral = await claimReferral(req.user.id, referredId);
    res.status(201).json(referral);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/referrals  (legacy — kept for backward compatibility)
 */
async function listReferrals(req, res, next) {
  try {
    const referrals = await getReferrals(req.user.id);
    res.json(referrals);
  } catch (err) {
    next(err);
  }
}

module.exports = { generate, claim, stats, refer, listReferrals };

