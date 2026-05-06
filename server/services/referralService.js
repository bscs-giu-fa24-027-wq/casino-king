'use strict';

const prisma = require('../utils/prisma');
const logger = require('../utils/logger');
const tokenService = require('./tokenService');

const REFERRAL_REWARD_CKC = 50; // CKC awarded to referrer when referred user makes first purchase

/**
 * Generates a referral link for a user and returns stats.
 * @param {string} userId
 * @returns {Promise<{ referralLink: string, totalReferrals: number, totalCkcEarned: number }>}
 */
async function generateReferralLink(userId) {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const referralLink = `${frontendUrl}/register?ref=${userId}`;

  const [totalReferrals, paidReferrals] = await Promise.all([
    prisma.referral.count({ where: { referrerId: userId } }),
    prisma.referral.count({ where: { referrerId: userId, isPaid: true } }),
  ]);

  const totalCkcEarned = paidReferrals * REFERRAL_REWARD_CKC;

  logger.info('Referral link generated', { userId });
  return { referralLink, totalReferrals, totalCkcEarned };
}

/**
 * Records a new referral when a user registers via a referral link.
 * @param {string} referrerId  - the userId in the ?ref= param
 * @param {string} referredId  - the newly registered user
 * @returns {Promise<object>}
 */
async function claimReferral(referrerId, referredId) {
  if (referrerId === referredId) {
    throw Object.assign(new Error('Cannot refer yourself'), { status: 400 });
  }

  // Validate referrer exists
  const referrer = await prisma.user.findUnique({ where: { id: referrerId } });
  if (!referrer) {
    throw Object.assign(new Error('Referrer not found'), { status: 404 });
  }

  // Already referred?
  const existing = await prisma.referral.findUnique({ where: { referredId } });
  if (existing) {
    throw Object.assign(new Error('User has already been referred'), { status: 400 });
  }

  const referral = await prisma.referral.create({ data: { referrerId, referredId } });
  logger.info('Referral claimed', { referrerId, referredId });
  return referral;
}

/**
 * Creates a referral record (legacy alias used by existing controller).
 */
const createReferral = claimReferral;

/**
 * Credits the referrer 50 CKC when the referred user makes their first purchase.
 * Marks Referral.isPaid = true.
 * @param {string} referredId
 * @returns {Promise<void>}
 */
async function creditReferrer(referredId) {
  const referral = await prisma.referral.findUnique({ where: { referredId } });

  if (!referral || referral.isPaid) return;

  await tokenService.creditBonus(referral.referrerId, REFERRAL_REWARD_CKC, 'REFERRAL');

  await prisma.referral.update({
    where: { referredId },
    data: { isPaid: true },
  });

  // Notify referrer
  await prisma.notification.create({
    data: {
      userId: referral.referrerId,
      title: 'Referral reward!',
      message: `You earned ${REFERRAL_REWARD_CKC} CKC for referring a new player who made their first purchase!`,
      type: 'BONUS',
    },
  });

  logger.info('Referral bonus credited', { referrerId: referral.referrerId, referredId });
}

/**
 * Returns all referrals and total CKC earned for a user.
 * @param {string} referrerId
 * @returns {Promise<{ referrals: object[], totalCkcEarned: number }>}
 */
async function getReferralStats(referrerId) {
  const referrals = await prisma.referral.findMany({
    where: { referrerId },
    include: {
      referred: { select: { id: true, fullName: true, createdAt: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const totalCkcEarned = referrals.filter((r) => r.isPaid).length * REFERRAL_REWARD_CKC;

  return { referrals, totalCkcEarned };
}

/**
 * Legacy alias — returns flat array of referrals (used by old controller).
 */
async function getReferrals(referrerId) {
  const { referrals } = await getReferralStats(referrerId);
  return referrals;
}

module.exports = { generateReferralLink, claimReferral, createReferral, creditReferrer, getReferralStats, getReferrals };
