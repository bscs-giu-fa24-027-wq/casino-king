'use strict';

const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const vipService = require('../services/vipService');
const { DEPOSIT_BONUS_PCT } = vipService;

// ─── GET /api/vip/tiers ────────────────────────────────────────────────────────
// Public. Returns all 5 VIP tiers with their requirements and perks.
router.get('/tiers', async (req, res, next) => {
  try {
    const tiers = await vipService.getAllTiers();
    res.json({ tiers });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/vip/status ──────────────────────────────────────────────────────
// Requires JWT. Returns the authenticated user's current tier, totalWagered,
// progress to the next tier (percentage), and perks list.
router.get('/status', authenticate, async (req, res, next) => {
  try {
    const status = await vipService.getVipStatus(req.user.id);

    res.json({
      tier: {
        id: status.tier.id,
        name: status.tier.name,
        minWager: status.tier.minWager,
        bonusPct: status.tier.bonusPct,
        badgeColor: status.tier.badgeColor,
        perks: status.tier.perks,
      },
      totalWagered: status.totalWagered,
      progressPct: status.progressPct,
      nextTier: status.nextTier
        ? {
            id: status.nextTier.id,
            name: status.nextTier.name,
            minWager: status.nextTier.minWager,
          }
        : null,
      ckcToNextTier: status.ckcToNextTier,
      depositBonusPct: DEPOSIT_BONUS_PCT[status.tier.name] ?? 0,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
