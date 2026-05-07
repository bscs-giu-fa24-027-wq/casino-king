'use strict';

const Stripe = require('stripe');
const { Prisma } = require('@prisma/client');
const prisma = require('../utils/prisma');
const logger = require('../utils/logger');
const tokenService = require('./tokenService');
const { CKC_RATE } = require('../../shared/constants');
const { creditReferrer } = require('./referralService');
const { triggerDeposit } = require('./missionService');
const { createNotification } = require('./notificationService');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-04-10',
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Enforce ResponsibleGambling deposit limits (same logic as tokenService).
 * Throws 403 if daily or weekly limit would be exceeded.
 */
async function _checkRgLimits(userId, usdPrice) {
  const rg = await prisma.responsibleGambling.findUnique({ where: { userId } });
  if (!rg) return;

  const MS_DAY = 24 * 60 * 60 * 1000;
  const MS_WEEK = 7 * MS_DAY;

  async function sumDeposited(windowMs) {
    const since = new Date(Date.now() - windowMs);
    const result = await prisma.transaction.aggregate({
      where: { userId, type: 'PURCHASE', status: 'COMPLETED', createdAt: { gte: since } },
      _sum: { usdAmount: true },
    });
    return result._sum.usdAmount ?? new Prisma.Decimal(0);
  }

  if (rg.dailyDepositLimit != null) {
    const used = await sumDeposited(MS_DAY);
    if (used.add(usdPrice).greaterThan(rg.dailyDepositLimit)) {
      const err = new Error('Daily deposit limit exceeded');
      err.status = 403;
      throw err;
    }
  }

  if (rg.weeklyDepositLimit != null) {
    const used = await sumDeposited(MS_WEEK);
    if (used.add(usdPrice).greaterThan(rg.weeklyDepositLimit)) {
      const err = new Error('Weekly deposit limit exceeded');
      err.status = 403;
      throw err;
    }
  }
}

// ─── Exported functions ───────────────────────────────────────────────────────

/**
 * Creates a Stripe Checkout Session for purchasing a token package.
 *
 * @param {string} userId
 * @param {string} packageId
 * @returns {Promise<{ checkoutUrl: string, sessionId: string }>}
 */
async function createCheckout(userId, packageId) {
  const pkg = await prisma.tokenPackage.findUnique({ where: { id: packageId } });
  if (!pkg || !pkg.isActive) {
    const err = new Error('Token package not found or inactive');
    err.status = 404;
    throw err;
  }

  const usdPrice = new Prisma.Decimal(pkg.usdPrice);

  await _checkRgLimits(userId, usdPrice);

  const amountCents = Math.round(usdPrice.toNumber() * 100);

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'usd',
          unit_amount: amountCents,
          product_data: {
            name: pkg.name,
          },
        },
        quantity: 1,
      },
    ],
    metadata: { userId, packageId },
    success_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/wallet?payment=success`,
    cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/wallet?payment=cancelled`,
  });

  logger.info('Stripe checkout session created', { userId, packageId, sessionId: session.id });

  return { checkoutUrl: session.url, sessionId: session.id };
}

/**
 * Creates a Stripe Checkout Session for dealer bulk CKC purchases.
 *
 * @param {string} userId
 * @param {number|string} usdAmount
 * @returns {Promise<{ checkoutUrl: string, sessionId: string, wholesaleCkc: string }>}
 */
async function createDealerBulkCheckout(userId, usdAmount) {
  const dealer = await prisma.dealer.findUnique({
    where: { userId },
    select: { status: true },
  });

  if (!dealer || dealer.status !== 'ACTIVE') {
    const err = new Error('Dealer account is not active');
    err.status = 403;
    throw err;
  }

  const parsedUsd = new Prisma.Decimal(usdAmount);
  if (parsedUsd.lessThan(new Prisma.Decimal(500))) {
    const err = new Error('Minimum bulk purchase amount is $500');
    err.status = 400;
    throw err;
  }

  await _checkRgLimits(userId, parsedUsd);

  const wholesaleCkc = parsedUsd
    .mul(new Prisma.Decimal(CKC_RATE))
    .mul(new Prisma.Decimal(1.2))
    .round();

  const amountCents = Math.round(parsedUsd.toNumber() * 100);

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'usd',
          unit_amount: amountCents,
          product_data: { name: 'Dealer Bulk CKC Purchase' },
        },
        quantity: 1,
      },
    ],
    metadata: {
      userId,
      dealerBulkPurchase: 'true',
      usdAmount: parsedUsd.toFixed(2),
      wholesaleCkc: wholesaleCkc.toFixed(0),
    },
    success_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/dealer?payment=success`,
    cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/dealer?payment=cancelled`,
  });

  logger.info('Dealer bulk Stripe checkout session created', { userId, sessionId: session.id });

  return { checkoutUrl: session.url, sessionId: session.id, wholesaleCkc: wholesaleCkc.toFixed(0) };
}

async function creditDealerBulkPurchase(userId, usdAmount, wholesaleCkc, sessionId) {
  const usd = new Prisma.Decimal(usdAmount);
  const ckc = new Prisma.Decimal(wholesaleCkc);
  const reference = `DEALER_BULK:${sessionId}`;

  await prisma.$transaction(async (tx) => {
    const dealer = await tx.dealer.findUnique({ where: { userId } });
    if (!dealer || dealer.status !== 'ACTIVE') {
      const err = new Error('Dealer account is not active');
      err.status = 403;
      throw err;
    }

    const wallet = await tx.wallet.findUnique({ where: { userId } });
    if (!wallet) {
      const err = new Error('Wallet not found');
      err.status = 404;
      throw err;
    }

    const existing = await tx.transaction.findFirst({ where: { reference } });
    if (existing) return;

    await tx.wallet.update({
      where: { userId },
      data: {
        ckcBalance: { increment: ckc },
        lifetimeDeposited: { increment: usd },
      },
    });

    await tx.transaction.create({
      data: {
        userId,
        walletId: wallet.id,
        type: 'PURCHASE',
        status: 'COMPLETED',
        ckcAmount: ckc,
        usdAmount: usd,
        reference,
      },
    });
  });
}

/**
 * Handles a Stripe webhook event.
 * Verifies the Stripe-Signature header and dispatches to event handlers.
 *
 * @param {Buffer|string} rawBody
 * @param {string} signature
 * @returns {Promise<void>}
 */
async function handleWebhook(rawBody, signature) {
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    logger.warn('Stripe webhook signature mismatch', { error: err.message });
    const e = new Error('Webhook signature verification failed');
    e.status = 400;
    throw e;
  }

  logger.info('Stripe webhook received', { type: event.type });

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const { userId, packageId } = session.metadata || {};

    if (session.metadata && session.metadata.dealerBulkPurchase === 'true') {
      if (!userId) {
        logger.warn('Dealer bulk checkout missing userId metadata', { sessionId: session.id });
        return;
      }

      try {
        const usdAmount = session.metadata.usdAmount;
        const wholesaleCkc = session.metadata.wholesaleCkc;
        await creditDealerBulkPurchase(userId, usdAmount, wholesaleCkc, session.id);
        await createNotification(userId, {
          title: 'Dealer bulk purchase successful',
          message: `Your dealer wallet was credited with ${wholesaleCkc} CKC.`,
          type: 'SYSTEM',
        });
        logger.info('Dealer bulk checkout handled', { userId, sessionId: session.id });
      } catch (err) {
        logger.error('Error handling dealer bulk checkout', {
          userId,
          sessionId: session.id,
          error: err.message,
        });
        throw err;
      }
      return;
    }

    if (!userId || !packageId) {
      logger.warn('checkout.session.completed missing metadata', { sessionId: session.id });
      return;
    }

    try {
      await tokenService.purchaseCkc(userId, packageId);

      // Credit referrer on first purchase (best-effort)
      try {
        await creditReferrer(userId);
      } catch (refErr) {
        logger.warn('creditReferrer failed', { userId, error: refErr.message });
      }

      // Trigger deposit mission (best-effort)
      try {
        await triggerDeposit(userId);
      } catch (missionErr) {
        logger.warn('triggerDeposit failed', { userId, error: missionErr.message });
      }

      logger.info('checkout.session.completed handled', { userId, packageId, sessionId: session.id });
    } catch (err) {
      logger.error('Error handling checkout.session.completed', {
        userId,
        packageId,
        sessionId: session.id,
        error: err.message,
      });
      throw err;
    }
  } else if (event.type === 'payment_intent.payment_failed') {
    const intent = event.data.object;

    // Locate the related transaction by payment intent id (stored in reference)
    const updated = await prisma.transaction.updateMany({
      where: { reference: intent.id, status: 'PENDING' },
      data: { status: 'FAILED' },
    });

    // Also try to match via checkout session if the intent id wasn't stored
    if (updated.count === 0 && intent.metadata && intent.metadata.sessionId) {
      await prisma.transaction.updateMany({
        where: { reference: intent.metadata.sessionId, status: 'PENDING' },
        data: { status: 'FAILED' },
      });
    }

    // Notify user if userId is in metadata
    const userId = intent.metadata && intent.metadata.userId;
    if (userId) {
      await createNotification(userId, {
        title: 'Payment failed',
        message: 'Your payment could not be processed. Please try again.',
        type: 'SYSTEM',
      });
    }

    logger.info('payment_intent.payment_failed handled', { intentId: intent.id, updated: updated.count });
  }
}

/**
 * Cash out CKC tokens to USD via Stripe Payout/Transfer (best effort).
 * Always records the REDEMPTION transaction via tokenService.redeemCkc.
 *
 * @param {string} userId
 * @param {number|string} ckcAmount
 * @returns {Promise<{ status: string, usdAmount: number, estimatedArrival: string|null }>}
 */
async function cashout(userId, ckcAmount) {
  const amount = new Prisma.Decimal(ckcAmount);

  if (amount.lessThan(new Prisma.Decimal(100))) {
    const minUsd = new Prisma.Decimal(100).div(new Prisma.Decimal(CKC_RATE)).toFixed(2);
    const err = new Error(`Minimum cashout is 100 CKC ($${minUsd} USD)`);
    err.status = 400;
    throw err;
  }

  // Record redemption in the DB (deducts wallet balance)
  const redemptionTx = await tokenService.redeemCkc(userId, ckcAmount);

  const usdAmount = amount.div(new Prisma.Decimal(CKC_RATE)).toNumber();

  // Attempt Stripe Payout / Transfer (best effort — requires configured Stripe account)
  let status = 'PENDING';
  let estimatedArrival = null;

  const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

  try {
    // Use Stripe Transfer to a connected account if STRIPE_CONNECTED_ACCOUNT_ID is set,
    // otherwise fall back to a direct Payout (requires Stripe account with bank attached)
    if (process.env.STRIPE_CONNECTED_ACCOUNT_ID) {
      const transfer = await stripe.transfers.create({
        amount: Math.round(usdAmount * 100),
        currency: 'usd',
        destination: process.env.STRIPE_CONNECTED_ACCOUNT_ID,
        metadata: { userId, redemptionTxId: redemptionTx.id },
      });

      await prisma.transaction.update({
        where: { id: redemptionTx.id },
        data: { reference: transfer.id },
      });

      status = 'COMPLETED';
      estimatedArrival = new Date(Date.now() + TWO_DAYS_MS).toISOString();

      logger.info('Stripe transfer created', { userId, transferId: transfer.id, usdAmount });
    } else {
      const payout = await stripe.payouts.create({
        amount: Math.round(usdAmount * 100),
        currency: 'usd',
        metadata: { userId, redemptionTxId: redemptionTx.id },
      });

      await prisma.transaction.update({
        where: { id: redemptionTx.id },
        data: { reference: payout.id },
      });

      status = payout.status === 'paid' ? 'COMPLETED' : 'PENDING';
      estimatedArrival = payout.arrival_date
        ? new Date(payout.arrival_date * 1000).toISOString()
        : null;

      logger.info('Stripe payout created', { userId, payoutId: payout.id, usdAmount });
    }
  } catch (stripeErr) {
    // Best-effort: log and leave transaction as PENDING
    logger.warn('Stripe payout/transfer failed (best effort)', {
      userId,
      usdAmount,
      error: stripeErr.message,
    });
  }

  return { status, usdAmount, estimatedArrival };
}

/**
 * Returns paginated PURCHASE and REDEMPTION transaction history for a user.
 *
 * @param {string} userId
 * @param {{ limit?: number, offset?: number }} options
 * @returns {Promise<{ transactions: object[], total: number }>}
 */
async function getPaymentHistory(userId, { limit = 20, offset = 0 } = {}) {
  const parsedLimit = Math.max(1, parseInt(limit, 10) || 20);
  const parsedOffset = Math.max(0, parseInt(offset, 10) || 0);

  const where = {
    userId,
    type: { in: ['PURCHASE', 'REDEMPTION'] },
  };

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: parsedOffset,
      take: parsedLimit,
    }),
    prisma.transaction.count({ where }),
  ]);

  return { transactions, total };
}

module.exports = { createCheckout, createDealerBulkCheckout, handleWebhook, cashout, getPaymentHistory };
