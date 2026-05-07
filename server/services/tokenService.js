'use strict';

const { Prisma } = require('@prisma/client');
const prisma = require('../utils/prisma');
const logger = require('../utils/logger');
const { CKC_RATE } = require('../../shared/constants');
const vipService = require('./vipService');
const rgService = require('./responsibleGamblingService');
const { createNotification } = require('./notificationService');

const REQUIRED_TERMS_VERSION = '1.0';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns the sum of usdAmount for COMPLETED PURCHASE transactions
 * created within the last `windowMs` milliseconds for the given user.
 * @param {string} userId
 * @param {number} windowMs
 * @returns {Promise<Prisma.Decimal>}
 */
async function _sumDepositedInWindow(userId, windowMs) {
  const since = new Date(Date.now() - windowMs);
  const result = await prisma.transaction.aggregate({
    where: {
      userId,
      type: 'PURCHASE',
      status: 'COMPLETED',
      createdAt: { gte: since },
    },
    _sum: { usdAmount: true },
  });
  return result._sum.usdAmount ?? new Prisma.Decimal(0);
}

async function assertTermsAcceptedForFirstDeposit(userId) {
  const priorPurchaseCount = await prisma.transaction.count({
    where: { userId, type: 'PURCHASE', status: 'COMPLETED' },
  });

  if (priorPurchaseCount > 0) return;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { termsAcceptedVersion: true, termsAcceptedAt: true },
  });

  if (!user || user.termsAcceptedVersion !== REQUIRED_TERMS_VERSION || !user.termsAcceptedAt) {
    const err = new Error('You must accept Terms & Conditions before your first deposit');
    err.status = 403;
    throw err;
  }
}

// ─── Exported functions ───────────────────────────────────────────────────────

/**
 * Purchase CKC tokens for a user using a token package.
 * Enforces responsible gambling deposit limits.
 * Awards a 100% first-deposit match bonus if applicable.
 *
 * @param {string} userId
 * @param {string} packageId
 * @returns {Promise<{ wallet: object, transaction: object, bonusCkc: Prisma.Decimal }>}
 */
async function purchaseCkc(userId, packageId) {
  const pkg = await prisma.tokenPackage.findUnique({ where: { id: packageId } });
  if (!pkg || !pkg.isActive) {
    const err = new Error('Token package not found or inactive');
    err.status = 404;
    throw err;
  }

  const usdPrice = new Prisma.Decimal(pkg.usdPrice);
  const totalCkc = new Prisma.Decimal(pkg.baseCkc).add(new Prisma.Decimal(pkg.bonusCkc));

  // ── Responsible gambling: cooling-off / self-exclusion ───────────────────
  await rgService.assertNotRestricted(userId, { action: 'make a deposit' });

  // ── Responsible gambling limits ──────────────────────────────────────────
  const rg = await prisma.responsibleGambling.findUnique({ where: { userId } });
  if (rg) {
    const MS_DAY = 24 * 60 * 60 * 1000;
    const MS_WEEK = 7 * MS_DAY;

    if (rg.dailyDepositLimit != null) {
      const dailyUsed = await _sumDepositedInWindow(userId, MS_DAY);
      if (dailyUsed.add(usdPrice).greaterThan(rg.dailyDepositLimit)) {
        const err = new Error('Daily deposit limit exceeded');
        err.status = 403;
        throw err;
      }
    }

    if (rg.weeklyDepositLimit != null) {
      const weeklyUsed = await _sumDepositedInWindow(userId, MS_WEEK);
      if (weeklyUsed.add(usdPrice).greaterThan(rg.weeklyDepositLimit)) {
        const err = new Error('Weekly deposit limit exceeded');
        err.status = 403;
        throw err;
      }
    }
  }

  await assertTermsAcceptedForFirstDeposit(userId);

  // ── Check for first deposit ───────────────────────────────────────────────
  const priorPurchaseCount = await prisma.transaction.count({
    where: { userId, type: 'PURCHASE', status: 'COMPLETED' },
  });
  const isFirstDeposit = priorPurchaseCount === 0;

  // ── VIP deposit bonus ─────────────────────────────────────────────────────
  // Bronze: +0%, Silver: +10%, Gold: +25%, Platinum: +50%, Diamond: +100%
  const vipBonusPct = await vipService.getDepositBonusPct(userId);
  const vipBonusCkc = vipBonusPct > 0
    ? totalCkc.mul(new Prisma.Decimal(vipBonusPct)).div(new Prisma.Decimal(100)).round()
    : new Prisma.Decimal(0);

  const bonusCkc = isFirstDeposit
    ? usdPrice.mul(new Prisma.Decimal(CKC_RATE))
    : new Prisma.Decimal(0);

  // ── Atomic transaction ────────────────────────────────────────────────────
  const { wallet, purchaseTx } = await prisma.$transaction(async (tx) => {
    const currentWallet = await tx.wallet.findUnique({ where: { userId } });
    if (!currentWallet) {
      const e = new Error('Wallet not found');
      e.status = 404;
      throw e;
    }

    // Credit wallet + create PURCHASE transaction
    const updatedWallet = await tx.wallet.update({
      where: { userId },
      data: {
        ckcBalance: { increment: totalCkc },
        lifetimeDeposited: { increment: usdPrice },
      },
    });

    const purchaseTx = await tx.transaction.create({
      data: {
        userId,
        walletId: currentWallet.id,
        type: 'PURCHASE',
        status: 'COMPLETED',
        ckcAmount: totalCkc,
        usdAmount: usdPrice,
        reference: pkg.name,
      },
    });

    if (isFirstDeposit) {
      await tx.wallet.update({
        where: { userId },
        data: { ckcBalance: { increment: bonusCkc } },
      });

      await tx.transaction.create({
        data: {
          userId,
          walletId: currentWallet.id,
          type: 'BONUS',
          status: 'COMPLETED',
          ckcAmount: bonusCkc,
          reference: 'FIRST_DEPOSIT_MATCH',
        },
      });
    }

    // ── VIP deposit bonus ──────────────────────────────────────────────────
    if (vipBonusCkc.greaterThan(new Prisma.Decimal(0))) {
      await tx.wallet.update({
        where: { userId },
        data: { ckcBalance: { increment: vipBonusCkc } },
      });

      await tx.transaction.create({
        data: {
          userId,
          walletId: currentWallet.id,
          type: 'BONUS',
          status: 'COMPLETED',
          ckcAmount: vipBonusCkc,
          reference: `VIP_DEPOSIT_BONUS_${vipBonusPct}PCT`,
        },
      });
    }

    // Re-fetch final wallet state
    const finalWallet = await tx.wallet.findUnique({ where: { userId } });
    return { wallet: finalWallet, purchaseTx };
  });

  logger.info('CKC purchased', {
    userId,
    packageId,
    totalCkc: totalCkc.toFixed(0),
    usdPrice: usdPrice.toFixed(2),
    isFirstDeposit,
    bonusCkc: bonusCkc.toFixed(0),
    vipBonusCkc: vipBonusCkc.toFixed(0),
    vipBonusPct,
  });

  // Send purchase success notification (best-effort)
  try {
    await createNotification(userId, {
      title: 'Purchase Successful',
      message: `You purchased ${totalCkc.toFixed(0)} CKC for $${usdPrice.toFixed(2)}. Your wallet has been credited.`,
      type: 'BONUS',
    });
  } catch (notifErr) {
    logger.warn('Purchase notification failed', { userId, error: notifErr.message });
  }

  return { wallet, transaction: purchaseTx, bonusCkc, vipBonusCkc };
}

/**
 * Redeem CKC tokens (cash out) for a user.
 * Minimum redemption is 100 CKC (= $10 USD).
 *
 * @param {string} userId
 * @param {number|string} ckcAmount
 * @returns {Promise<object>} created REDEMPTION transaction
 */
async function redeemCkc(userId, ckcAmount) {
  const amount = new Prisma.Decimal(ckcAmount);

  if (amount.lessThan(new Prisma.Decimal(100))) {
    const err = new Error('Minimum redemption amount is 100 CKC');
    err.status = 400;
    throw err;
  }

  const transaction = await prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.findUnique({ where: { userId } });
    if (!wallet) {
      const e = new Error('Wallet not found');
      e.status = 404;
      throw e;
    }

    if (wallet.ckcBalance.lessThan(amount)) {
      const e = new Error('Insufficient wallet balance');
      e.status = 400;
      throw e;
    }

    await tx.wallet.update({
      where: { userId },
      data: { ckcBalance: { decrement: amount } },
    });

    const redemptionTx = await tx.transaction.create({
      data: {
        userId,
        walletId: wallet.id,
        type: 'REDEMPTION',
        status: 'PENDING',
        ckcAmount: amount,
      },
    });

    return redemptionTx;
  });

  logger.info('CKC redemption requested', { userId, ckcAmount: amount.toFixed(0) });

  // Send cashout notification (best-effort)
  try {
    await createNotification(userId, {
      title: 'Cashout Initiated',
      message: `Your cashout request for ${amount.toFixed(0)} CKC has been submitted and is being processed.`,
      type: 'SYSTEM',
    });
  } catch (notifErr) {
    logger.warn('Cashout notification failed', { userId, error: notifErr.message });
  }

  return transaction;
}

/**
 * Deduct CKC from a user's wallet for a game stake (internal use by gameService).
 *
 * @param {string} userId
 * @param {number|string} ckcAmount
 * @returns {Promise<object>} updated wallet
 */
async function stakeCkc(userId, ckcAmount) {
  const amount = new Prisma.Decimal(ckcAmount);

  const wallet = await prisma.$transaction(async (tx) => {
    const currentWallet = await tx.wallet.findUnique({ where: { userId } });
    if (!currentWallet) {
      const e = new Error('Wallet not found');
      e.status = 404;
      throw e;
    }

    if (currentWallet.ckcBalance.lessThan(amount)) {
      const e = new Error('Insufficient wallet balance');
      e.status = 400;
      throw e;
    }

    const updatedWallet = await tx.wallet.update({
      where: { userId },
      data: { ckcBalance: { decrement: amount } },
    });

    await tx.transaction.create({
      data: {
        userId,
        walletId: currentWallet.id,
        type: 'GAME_STAKE',
        status: 'COMPLETED',
        ckcAmount: amount,
      },
    });

    return updatedWallet;
  });

  logger.info('CKC staked', { userId, ckcAmount: amount.toFixed(0) });
  return wallet;
}

/**
 * Credit a user's wallet with winnings from a game round.
 *
 * @param {string} userId
 * @param {number|string} ckcAmount
 * @param {string} roundId
 * @returns {Promise<object>} updated wallet
 */
async function creditWin(userId, ckcAmount, roundId) {
  const amount = new Prisma.Decimal(ckcAmount);

  const wallet = await prisma.$transaction(async (tx) => {
    const currentWallet = await tx.wallet.findUnique({ where: { userId } });
    if (!currentWallet) {
      const e = new Error('Wallet not found');
      e.status = 404;
      throw e;
    }

    const updatedWallet = await tx.wallet.update({
      where: { userId },
      data: { ckcBalance: { increment: amount } },
    });

    await tx.transaction.create({
      data: {
        userId,
        walletId: currentWallet.id,
        type: 'GAME_WIN',
        status: 'COMPLETED',
        ckcAmount: amount,
        reference: roundId,
      },
    });

    return updatedWallet;
  });

  logger.info('CKC win credited', { userId, ckcAmount: amount.toFixed(0), roundId });
  return wallet;
}

/**
 * Credit a user's wallet with a bonus or referral reward.
 *
 * @param {string} userId
 * @param {number|string} ckcAmount
 * @param {'BONUS'|'REFERRAL'} type
 * @returns {Promise<object>} updated wallet
 */
async function creditBonus(userId, ckcAmount, type) {
  if (type !== 'BONUS' && type !== 'REFERRAL') {
    const err = new Error('type must be BONUS or REFERRAL');
    err.status = 400;
    throw err;
  }

  const amount = new Prisma.Decimal(ckcAmount);

  const wallet = await prisma.$transaction(async (tx) => {
    const currentWallet = await tx.wallet.findUnique({ where: { userId } });
    if (!currentWallet) {
      const e = new Error('Wallet not found');
      e.status = 404;
      throw e;
    }

    const updatedWallet = await tx.wallet.update({
      where: { userId },
      data: { ckcBalance: { increment: amount } },
    });

    await tx.transaction.create({
      data: {
        userId,
        walletId: currentWallet.id,
        type,
        status: 'COMPLETED',
        ckcAmount: amount,
      },
    });

    return updatedWallet;
  });

  logger.info('CKC bonus credited', { userId, ckcAmount: amount.toFixed(0), type });
  return wallet;
}

/**
 * Returns the current wallet for a user.
 *
 * @param {string} userId
 * @returns {Promise<object>} wallet
 */
async function getWalletBalance(userId) {
  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet) {
    const err = new Error('Wallet not found');
    err.status = 404;
    throw err;
  }
  return wallet;
}

/**
 * Returns paginated transaction history for a user.
 *
 * @param {string} userId
 * @param {{ limit?: number, offset?: number, type?: string }} options
 * @returns {Promise<object[]>}
 */
async function getTransactionHistory(userId, { limit = 20, offset = 0, type } = {}) {
  const where = { userId };
  if (type) {
    where.type = type;
  }

  const parsedLimit = Math.max(1, parseInt(limit, 10) || 20);
  const parsedOffset = Math.max(0, parseInt(offset, 10) || 0);

  return prisma.transaction.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    skip: parsedOffset,
    take: parsedLimit,
  });
}

module.exports = {
  assertTermsAcceptedForFirstDeposit,
  purchaseCkc,
  redeemCkc,
  stakeCkc,
  creditWin,
  creditBonus,
  getWalletBalance,
  getTransactionHistory,
};
