'use strict';

const { redeemBonus, getUserBonuses } = require('../services/bonusService');

/**
 * POST /api/bonuses/redeem
 */
async function redeem(req, res, next) {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'code is required' });

    const result = await redeemBonus(req.user.id, code);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/bonuses
 */
async function listMyBonuses(req, res, next) {
  try {
    const bonuses = await getUserBonuses(req.user.id);
    res.json(bonuses);
  } catch (err) {
    next(err);
  }
}

module.exports = { redeem, listMyBonuses };
