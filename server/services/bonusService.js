'use strict';

const prisma = require('../utils/prisma');
const logger = require('../utils/logger');

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

module.exports = { redeemBonus, getUserBonuses };
