'use strict';

const prisma = require('../utils/prisma');
const logger = require('../utils/logger');
const { createNotification } = require('./notificationService');

// ─── VIP Deposit Bonus Percentages ────────────────────────────────────────────
// Applied on top of purchased CKC amount per VIP tier.
const DEPOSIT_BONUS_PCT = {
  Bronze:   0,
  Silver:   10,
  Gold:     25,
  Platinum: 50,
  Diamond:  100,
};

// ─── Tier Ordering ────────────────────────────────────────────────────────────
// Tiers that grant Gold-level exclusive game access (Gold and above).
const GOLD_PLUS_TIERS = new Set(['Gold', 'Platinum', 'Diamond']);

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Returns all VIP tiers ordered by minWager ascending.
 * @returns {Promise<object[]>}
 */
async function getAllTiers() {
  return prisma.vipTier.findMany({ orderBy: { minWager: 'asc' } });
}

// ─── Exported Functions ───────────────────────────────────────────────────────

/**
 * Returns the current VIP status for a user, including progress toward the
 * next tier.
 *
 * @param {string} userId
 * @returns {Promise<{
 *   tier: object,
 *   totalWagered: number,
 *   progressPct: number,
 *   nextTier: object|null,
 *   ckcToNextTier: number
 * }>}
 */
async function getVipStatus(userId) {
  const userVip = await prisma.userVip.findUnique({
    where: { userId },
    include: { tier: true },
  });

  if (!userVip) {
    const err = new Error('VIP record not found for user');
    err.status = 404;
    throw err;
  }

  const allTiers = await getAllTiers();
  const currentTierIdx = allTiers.findIndex((t) => t.id === userVip.tierId);
  const nextTier = currentTierIdx < allTiers.length - 1
    ? allTiers[currentTierIdx + 1]
    : null;

  let progressPct = 100;
  let ckcToNextTier = 0;

  if (nextTier) {
    const currentMin = Number(userVip.tier.minWager);
    const nextMin = Number(nextTier.minWager);
    const range = nextMin - currentMin;
    const earned = Number(userVip.totalWagered) - currentMin;
    progressPct = range > 0
      ? Math.min(100, Math.max(0, Math.round((earned / range) * 100)))
      : 100;
    ckcToNextTier = Math.max(0, nextMin - Number(userVip.totalWagered));
  }

  return {
    tier: userVip.tier,
    totalWagered: userVip.totalWagered,
    progressPct,
    nextTier,
    ckcToNextTier,
  };
}

/**
 * Checks whether a user qualifies for a VIP tier upgrade after a game round.
 * If the user's totalWagered has crossed into a higher tier:
 *   - Updates UserVip.tierId
 *   - Sends an upgrade notification
 *   - Applies any tier-specific perks (dedicated support, account manager flags)
 *
 * @param {string} userId
 * @returns {Promise<{
 *   tier: object,
 *   upgraded: boolean,
 *   nextTier: object|null,
 *   ckcToNextTier: number
 * }|null>}
 */
async function checkVipUpgrade(userId) {
  const userVip = await prisma.userVip.findUnique({
    where: { userId },
    include: { tier: true },
  });

  if (!userVip) return null;

  const allTiers = await getAllTiers();
  const totalWagered = Number(userVip.totalWagered);

  // Find the highest tier where minWager <= totalWagered
  let bestTier = null;
  for (const tier of allTiers) {
    if (Number(tier.minWager) <= totalWagered) {
      bestTier = tier;
    }
  }

  const upgraded = bestTier !== null && bestTier.id !== userVip.tierId;

  if (upgraded) {
    await prisma.userVip.update({
      where: { userId },
      data: { tierId: bestTier.id },
    });

    await prisma.notification.create({
      data: {
        userId,
        title: `VIP Upgrade: ${bestTier.name}!`,
        message: `Congratulations! You've been upgraded to the ${bestTier.name} VIP tier. Enjoy your exclusive perks!`,
        type: 'PROMO',
      },
    });

    await _applyTierPerks(userId, bestTier);

    logger.info('VIP tier upgraded', { userId, newTier: bestTier.name });
  }

  // Determine the effective current tier and the next tier
  const effectiveTierId = upgraded ? bestTier.id : userVip.tierId;
  const effectiveTierIdx = allTiers.findIndex((t) => t.id === effectiveTierId);
  const nextTier = effectiveTierIdx < allTiers.length - 1
    ? allTiers[effectiveTierIdx + 1]
    : null;
  const ckcToNextTier = nextTier
    ? Math.max(0, Number(nextTier.minWager) - totalWagered)
    : 0;

  return {
    tier: upgraded ? bestTier : userVip.tier,
    upgraded,
    nextTier,
    ckcToNextTier,
  };
}

/**
 * Returns the VIP deposit bonus percentage for a user (0–100).
 * Returns 0 if the user has no VIP record.
 *
 * @param {string} userId
 * @returns {Promise<number>}
 */
async function getDepositBonusPct(userId) {
  const userVip = await prisma.userVip.findUnique({
    where: { userId },
    include: { tier: true },
  });

  if (!userVip || !userVip.tier) return 0;
  return DEPOSIT_BONUS_PCT[userVip.tier.name] ?? 0;
}

/**
 * Returns whether the user has Gold-tier (or above) access,
 * required for exclusive games.
 *
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
async function hasGoldAccess(userId) {
  const userVip = await prisma.userVip.findUnique({
    where: { userId },
    include: { tier: true },
  });

  if (!userVip || !userVip.tier) return false;
  return GOLD_PLUS_TIERS.has(userVip.tier.name);
}

// ─── Internal ─────────────────────────────────────────────────────────────────

/**
 * Applies tier-specific user flags when a user reaches a new tier.
 *
 * @param {string} userId
 * @param {object} tier
 */
async function _applyTierPerks(userId, tier) {
  const tierName = tier.name;

  if (tierName === 'Platinum') {
    await prisma.user.update({
      where: { id: userId },
      data: { hasDedicatedSupport: true },
    });
  } else if (tierName === 'Diamond') {
    await prisma.user.update({
      where: { id: userId },
      data: {
        hasDedicatedSupport: true,
        hasPersonalAccountManager: true,
      },
    });
  }
}

module.exports = {
  getAllTiers,
  getVipStatus,
  checkVipUpgrade,
  getDepositBonusPct,
  hasGoldAccess,
  DEPOSIT_BONUS_PCT,
};
