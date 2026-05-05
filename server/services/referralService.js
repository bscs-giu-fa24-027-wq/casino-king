'use strict';

const prisma = require('../utils/prisma');
const logger = require('../utils/logger');

const REFERRAL_BONUS_USD = 10; // USD credited to referrer when referred user deposits

/**
 * Creates a referral link record.
 * @param {string} referrerId
 * @param {string} referredId
 * @returns {Promise<object>}
 */
async function createReferral(referrerId, referredId) {
  if (referrerId === referredId) {
    throw Object.assign(new Error('Cannot refer yourself'), { status: 400 });
  }

  const existing = await prisma.referral.findUnique({ where: { referredId } });
  if (existing) {
    throw Object.assign(new Error('User has already been referred'), { status: 400 });
  }

  const referral = await prisma.referral.create({ data: { referrerId, referredId } });
  logger.info('Referral created', { referrerId, referredId });
  return referral;
}

/**
 * Credits the referrer when the referred user makes their first deposit.
 * @param {string} referredId
 * @returns {Promise<void>}
 */
async function creditReferrer(referredId) {
  const referral = await prisma.referral.findUnique({
    where: { referredId },
    include: { referrer: true },
  });

  if (!referral) return;

  await prisma.$transaction([
    prisma.wallet.upsert({
      where: { userId: referral.referrerId },
      update: { balance: { increment: REFERRAL_BONUS_USD } },
      create: { userId: referral.referrerId, balance: REFERRAL_BONUS_USD },
    }),
    prisma.transaction.create({
      data: {
        userId: referral.referrerId,
        type: 'REFERRAL',
        amount: REFERRAL_BONUS_USD,
        status: 'COMPLETED',
        reference: `referral:${referredId}`,
      },
    }),
  ]);

  logger.info('Referral bonus credited', { referrerId: referral.referrerId, referredId });
}

/**
 * Returns all referrals made by a user.
 * @param {string} referrerId
 * @returns {Promise<object[]>}
 */
async function getReferrals(referrerId) {
  return prisma.referral.findMany({
    where: { referrerId },
    include: { referred: { select: { id: true, username: true, createdAt: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

module.exports = { createReferral, creditReferrer, getReferrals };
