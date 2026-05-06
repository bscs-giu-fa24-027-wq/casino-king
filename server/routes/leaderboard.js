'use strict';

const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const prisma = require('../utils/prisma');
const { getWeekBounds, getMonthBounds } = require('../services/leaderboardService');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TOP_N = 50;

/**
 * Fetch top N entries for the current period and return them with
 * rank, username, and totalWagered.
 *
 * @param {'WEEKLY'|'MONTHLY'} period
 * @param {{ start: Date, end: Date }} bounds
 * @returns {Promise<Array<{ rank: number, username: string, totalWagered: number }>>}
 */
async function fetchTopEntries(period, bounds) {
  const entries = await prisma.leaderboard.findMany({
    where: {
      period,
      periodStart: bounds.start,
      periodEnd: bounds.end,
    },
    orderBy: { totalWagered: 'desc' },
    take: TOP_N,
    include: {
      user: { select: { fullName: true } },
    },
  });

  return entries.map((e, index) => ({
    rank: e.rank !== null ? e.rank : index + 1,
    username: e.user.fullName,
    totalWagered: e.totalWagered,
  }));
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /api/leaderboard/weekly
 * Public. Returns top 50 players for the current week.
 */
router.get('/weekly', async (req, res, next) => {
  try {
    const bounds = getWeekBounds();
    const entries = await fetchTopEntries('WEEKLY', bounds);
    res.json({
      period: 'WEEKLY',
      periodStart: bounds.start,
      periodEnd: bounds.end,
      entries,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/leaderboard/monthly
 * Public. Returns top 50 players for the current month.
 */
router.get('/monthly', async (req, res, next) => {
  try {
    const bounds = getMonthBounds();
    const entries = await fetchTopEntries('MONTHLY', bounds);
    res.json({
      period: 'MONTHLY',
      periodStart: bounds.start,
      periodEnd: bounds.end,
      entries,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/leaderboard/me
 * Requires JWT. Returns the authenticated user's rank for both periods.
 */
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const weekBounds = getWeekBounds();
    const monthBounds = getMonthBounds();

    const [weekEntry, monthEntry] = await Promise.all([
      prisma.leaderboard.findFirst({
        where: {
          userId,
          period: 'WEEKLY',
          periodStart: weekBounds.start,
          periodEnd: weekBounds.end,
        },
        select: { rank: true, totalWagered: true },
      }),
      prisma.leaderboard.findFirst({
        where: {
          userId,
          period: 'MONTHLY',
          periodStart: monthBounds.start,
          periodEnd: monthBounds.end,
        },
        select: { rank: true, totalWagered: true },
      }),
    ]);

    res.json({
      weekly: weekEntry
        ? { rank: weekEntry.rank, totalWagered: weekEntry.totalWagered }
        : { rank: null, totalWagered: 0 },
      monthly: monthEntry
        ? { rank: monthEntry.rank, totalWagered: monthEntry.totalWagered }
        : { rank: null, totalWagered: 0 },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
