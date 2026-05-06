'use strict';

const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const rgService = require('../services/responsibleGamblingService');

// ─── GET /api/responsible/settings ───────────────────────────────────────────
// Requires JWT. Returns the authenticated user's current ResponsibleGambling settings.
router.get('/settings', authenticate, async (req, res, next) => {
  try {
    const settings = await rgService.getSettings(req.user.id);
    res.json({ settings });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /api/responsible/limits ───────────────────────────────────────────
// Requires JWT. Body: { dailyDepositLimit?, weeklyDepositLimit? }
// Only allows LOWERING limits; raising requires 24h cool-off.
router.patch('/limits', authenticate, async (req, res, next) => {
  try {
    const { dailyDepositLimit, weeklyDepositLimit } = req.body;
    const updated = await rgService.updateLimits(req.user.id, { dailyDepositLimit, weeklyDepositLimit });
    res.json({ settings: updated });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/responsible/cooling-off ───────────────────────────────────────
// Requires JWT. Body: { hours: 24|48|72|168 }
// Sets coolingOffUntil = now + hours. Blocks gameplay and deposits.
router.post('/cooling-off', authenticate, async (req, res, next) => {
  try {
    const hours = Number(req.body.hours);
    const updated = await rgService.setCoolingOff(req.user.id, hours);
    res.json({ settings: updated, message: `Cooling-off period set until ${updated.coolingOffUntil.toISOString()}` });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/responsible/self-exclude ──────────────────────────────────────
// Requires JWT. Body: { months: 1|3|6|12 }
// Sets selfExcludedUntil = now + months. Immediately suspends account.
router.post('/self-exclude', authenticate, async (req, res, next) => {
  try {
    const months = Number(req.body.months);
    const updated = await rgService.selfExclude(req.user.id, months);
    res.json({
      settings: updated,
      message: `Account self-excluded until ${updated.selfExcludedUntil.toISOString()}. Your account has been suspended for this period. Only an admin can reverse this.`,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
