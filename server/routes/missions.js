'use strict';

const router = require('express').Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const prisma = require('../utils/prisma');
const { getActiveMissions, updateMissionProgress } = require('../services/missionService');

/**
 * GET /api/missions
 * Requires JWT. Returns all active missions with user's current progress.
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const missions = await getActiveMissions(req.user.id);
    res.json(missions);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/missions/:id/progress
 * Internal — called by game engine after each round.
 * Requires JWT + admin role (internal use).
 * Body: { increment } (optional, default 1)
 */
router.post('/:id/progress', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const increment = parseInt(req.body.increment, 10) || 1;

    // userId can be passed as body param (game engine specifying which user)
    const userId = req.body.userId || req.user.id;

    const userMission = await updateMissionProgress(userId, id, increment);
    if (!userMission) {
      return res.status(404).json({ error: 'Mission not found or inactive' });
    }
    res.json(userMission);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
