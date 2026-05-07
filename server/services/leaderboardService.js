'use strict';

const prisma = require('../utils/prisma');
const logger = require('../utils/logger');
const tokenService = require('./tokenService');
const { createNotification } = require('./notificationService');
const { getPrizeForRank } = require('../config/leaderboardPrizes');

// ─── Period Helpers ───────────────────────────────────────────────────────────

/**
 * Returns the ISO-week bounds (Monday–Sunday) for the current UTC week.
 * @returns {{ start: Date, end: Date }}
 */
function getWeekBounds() {
  const now = new Date();
  // ISO week: Monday = 1 … Sunday = 0, adjust so Monday is day 0 offset
  const day = now.getUTCDay(); // 0=Sun, 1=Mon, …, 6=Sat
  const daysFromMonday = day === 0 ? 6 : day - 1;
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(now.getUTCDate() - daysFromMonday);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  end.setUTCHours(23, 59, 59, 999);
  return { start, end };
}

/**
 * Returns the bounds of the current UTC calendar month.
 * @returns {{ start: Date, end: Date }}
 */
function getMonthBounds() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999)
  );
  return { start, end };
}

/**
 * Returns the period bounds for the given period type.
 * @param {'WEEKLY'|'MONTHLY'} period
 * @returns {{ start: Date, end: Date }}
 */
function getPeriodBounds(period) {
  if (period === 'WEEKLY') return getWeekBounds();
  if (period === 'MONTHLY') return getMonthBounds();
  throw new Error(`Unknown period: ${period}`);
}

// ─── Core Functions ───────────────────────────────────────────────────────────

/**
 * Upsert a Leaderboard entry for the current period and increment totalWagered.
 * Called automatically by the game service after each round.
 *
 * @param {string} userId
 * @param {number} ckcWagered - integer CKC amount wagered this round
 * @param {'WEEKLY'|'MONTHLY'} period
 * @returns {Promise<void>}
 */
async function updateLeaderboard(userId, ckcWagered, period) {
  const { start, end } = getPeriodBounds(period);
  const amount = Math.round(Number(ckcWagered));

  const existing = await prisma.leaderboard.findFirst({
    where: { userId, period, periodStart: start, periodEnd: end },
  });

  if (existing) {
    await prisma.leaderboard.update({
      where: { id: existing.id },
      data: { totalWagered: { increment: amount } },
    });
  } else {
    await prisma.leaderboard.create({
      data: { userId, period, periodStart: start, periodEnd: end, totalWagered: amount },
    });
  }
}

/**
 * Re-rank all leaderboard entries for the current period by totalWagered DESC.
 * Updates the `rank` field on each entry. Safe to call repeatedly (idempotent).
 *
 * @param {'WEEKLY'|'MONTHLY'} period
 * @returns {Promise<void>}
 */
async function calculateRanks(period) {
  const { start, end } = getPeriodBounds(period);

  const entries = await prisma.leaderboard.findMany({
    where: { period, periodStart: start, periodEnd: end },
    orderBy: { totalWagered: 'desc' },
    select: { id: true },
  });

  if (entries.length === 0) return;

  await prisma.$transaction(
    entries.map((entry, index) =>
      prisma.leaderboard.update({
        where: { id: entry.id },
        data: { rank: index + 1 },
      })
    )
  );

  logger.info('Leaderboard ranks recalculated', { period, count: entries.length });
}

/**
 * Award prizes to top-ranked users at the end of the period.
 * Idempotent: entries that already have prizePaidAt set are skipped.
 *
 * @param {'WEEKLY'|'MONTHLY'} period
 * @param {{ start: Date, end: Date }} [bounds] - optional explicit period bounds (for past periods)
 * @returns {Promise<void>}
 */
async function awardLeaderboardPrizes(period, bounds) {
  const { start, end } = bounds || getPeriodBounds(period);

  const entries = await prisma.leaderboard.findMany({
    where: {
      period,
      periodStart: start,
      periodEnd: end,
      rank: { not: null },
      prizePaidAt: null, // skip already-paid entries
    },
    include: {
      user: { select: { id: true, fullName: true } },
    },
    orderBy: { rank: 'asc' },
  });

  if (entries.length === 0) {
    logger.info('No unpaid leaderboard entries found', { period });
    return;
  }

  const now = new Date();
  let awarded = 0;

  for (const entry of entries) {
    const prizeAmount = getPrizeForRank(period, entry.rank);
    if (prizeAmount <= 0) continue;

    try {
      await tokenService.creditBonus(entry.userId, prizeAmount, 'BONUS');

      await prisma.leaderboard.update({
        where: { id: entry.id },
        data: { prizePaidAt: now },
      });

      await createNotification(entry.userId, {
        title: `🏆 Leaderboard Prize — ${period === 'WEEKLY' ? 'Weekly' : 'Monthly'} #${entry.rank}`,
        message: `Congratulations! You finished rank #${entry.rank} on the ${period === 'WEEKLY' ? 'weekly' : 'monthly'} leaderboard and earned ${prizeAmount} CKC!`,
        type: 'PROMO',
      });

      awarded++;
      logger.info('Leaderboard prize awarded', {
        period,
        userId: entry.userId,
        rank: entry.rank,
        prizeAmount,
      });
    } catch (err) {
      logger.error('Failed to award leaderboard prize', {
        period,
        userId: entry.userId,
        rank: entry.rank,
        error: err.message,
      });
    }
  }

  logger.info('Leaderboard prizes distribution complete', { period, awarded });
}

module.exports = {
  updateLeaderboard,
  calculateRanks,
  awardLeaderboardPrizes,
  getWeekBounds,
  getMonthBounds,
  getPeriodBounds,
};
