'use strict';

const prisma = require('../utils/prisma');
const logger = require('../utils/logger');

// ─── Daily bonus constants ────────────────────────────────────────────────────
const BASE_DAILY_BONUS = 10;   // CKC per streak day (streak 1=10, 2=20, 3=30, 4=40, 5+=50)
const MAX_STREAK_MULTIPLIER = 5; // cap streak multiplier at 5

/**
 * Applies a bonus code to a user's wallet.
 * @param {string} userId
 * @param {string} code
 * @returns {Promise<{ bonus: object, credited: number }>}
 */
async function redeemBonus(userId, code) {
  const bonus = await prisma.bonus.findUnique({ where: { code } });

  if (!bonus) {
    throw Object.assign(new Error('Invalid bonus code'), { status: 400 });
  }

  if (bonus.expiresAt && bonus.expiresAt < new Date()) {
    throw Object.assign(new Error('Bonus code has expired'), { status: 400 });
  }

  if (bonus.usedCount >= bonus.maxUses) {
    throw Object.assign(new Error('Bonus code has reached its usage limit'), { status: 400 });
  }

  const alreadyUsed = await prisma.userBonus.findFirst({ where: { userId, bonusId: bonus.id } });
  if (alreadyUsed) {
    throw Object.assign(new Error('You have already used this bonus code'), { status: 400 });
  }

  const value = parseFloat(bonus.value);

  await prisma.$transaction([
    prisma.userBonus.create({ data: { userId, bonusId: bonus.id } }),
    prisma.bonus.update({ where: { id: bonus.id }, data: { usedCount: { increment: 1 } } }),
    prisma.wallet.upsert({
      where: { userId },
      update: { balance: { increment: value } },
      create: { userId, balance: value },
    }),
    prisma.transaction.create({
      data: { userId, type: 'BONUS', amount: value, status: 'COMPLETED', reference: bonus.code },
    }),
  ]);

  logger.info('Bonus redeemed', { userId, code, value });
  return { bonus, credited: value };
}

/**
 * Returns all bonuses claimed by a user.
 * @param {string} userId
 * @returns {Promise<object[]>}
 */
async function getUserBonuses(userId) {
  return prisma.userBonus.findMany({
    where: { userId },
    include: { bonus: true },
    orderBy: { claimedAt: 'desc' },
  });
}

/**
 * Checks if a daily login bonus should be awarded and creates the records atomically.
 * Creates: DailyBonus + Transaction(BONUS, COMPLETED) + Wallet increment.
 * No-op (returns null) if already claimed today.
 * @param {string} userId
 * @returns {Promise<{ ckcAwarded: number, streakDay: number } | null>}
 */
async function checkDailyBonus(userId) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // Already claimed today?
  const existing = await prisma.dailyBonus.findFirst({
    where: { userId, claimedAt: { gte: today } },
  });
  if (existing) return null;

  // Determine streak
  const userVip = await prisma.userVip.findUnique({ where: { userId } });
  let streakDay = 1;
  if (userVip?.lastLoginBonusAt) {
    const lastBonus = new Date(userVip.lastLoginBonusAt);
    lastBonus.setUTCHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    if (lastBonus.getTime() === yesterday.getTime()) {
      streakDay = (userVip.currentStreakDays || 0) + 1;
    }
  }

  // baseCkc=10, multiplier=min(streakDay,5), ckcAwarded=baseCkc*multiplier
  const multiplier = Math.min(streakDay, MAX_STREAK_MULTIPLIER);
  const ckcAwarded = BASE_DAILY_BONUS * multiplier;

  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet) return null;

  const ops = [
    prisma.dailyBonus.create({ data: { userId, ckcAwarded, streakDay } }),
    prisma.transaction.create({
      data: {
        userId,
        walletId: wallet.id,
        type: 'BONUS',
        ckcAmount: ckcAwarded,
        status: 'COMPLETED',
        reference: `daily-login-day-${streakDay}`,
      },
    }),
    prisma.wallet.update({
      where: { userId },
      data: { ckcBalance: { increment: ckcAwarded } },
    }),
  ];

  if (userVip) {
    ops.push(
      prisma.userVip.update({
        where: { userId },
        data: { currentStreakDays: streakDay, lastLoginBonusAt: new Date() },
      })
    );
  }

  await prisma.$transaction(ops);

  logger.info('Daily login bonus awarded', { userId, ckcAwarded, streakDay });
  return { ckcAwarded, streakDays: streakDay, multiplier };
}

/**
 * Returns the current streak and today's bonus status for a user.
 * @param {string} userId
 * @returns {Promise<{ streakDays: number, claimedToday: boolean, ckcIfClaimed: number, multiplier: number }>}
 */
async function getStreakStatus(userId) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const [claimed, userVip] = await Promise.all([
    prisma.dailyBonus.findFirst({ where: { userId, claimedAt: { gte: today } } }),
    prisma.userVip.findUnique({ where: { userId } }),
  ]);

  const streakDays = userVip?.currentStreakDays ?? 0;
  const claimedToday = !!claimed;
  const nextStreakDay = claimedToday ? streakDays : streakDays + 1;
  const multiplier = Math.min(nextStreakDay, MAX_STREAK_MULTIPLIER);
  const ckcIfClaimed = BASE_DAILY_BONUS * multiplier;

  return { streakDays, claimedToday, ckcIfClaimed, multiplier };
}

module.exports = { redeemBonus, getUserBonuses, checkDailyBonus, getStreakStatus };
