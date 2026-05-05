'use strict';

const Stripe = require('stripe');
const prisma = require('../utils/prisma');
const logger = require('../utils/logger');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-04-10',
});

/**
 * Creates a Stripe PaymentIntent for a deposit.
 * @param {string} userId
 * @param {number} amountUsd  Amount in USD (not cents)
 * @returns {Promise<{ clientSecret: string, transactionId: string }>}
 */
async function createDepositIntent(userId, amountUsd) {
  const amountCents = Math.round(amountUsd * 100);

  const intent = await stripe.paymentIntents.create({
    amount: amountCents,
    currency: 'usd',
    metadata: { userId },
  });

  const tx = await prisma.transaction.create({
    data: {
      userId,
      type: 'DEPOSIT',
      amount: amountUsd,
      currency: 'USD',
      status: 'PENDING',
      reference: intent.id,
    },
  });

  return { clientSecret: intent.client_secret, transactionId: tx.id };
}

/**
 * Handles a confirmed Stripe webhook event and credits the user's wallet.
 * @param {string} rawBody
 * @param {string} signature
 * @returns {Promise<void>}
 */
async function handleStripeWebhook(rawBody, signature) {
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    logger.warn('Stripe webhook signature mismatch', { error: err.message });
    throw Object.assign(new Error('Webhook signature verification failed'), { status: 400 });
  }

  if (event.type === 'payment_intent.succeeded') {
    const intent = event.data.object;
    const { userId } = intent.metadata;
    const amountUsd = intent.amount / 100;

    await prisma.$transaction([
      prisma.transaction.updateMany({
        where: { reference: intent.id },
        data: { status: 'COMPLETED' },
      }),
      prisma.wallet.upsert({
        where: { userId },
        update: { balance: { increment: amountUsd } },
        create: { userId, balance: amountUsd },
      }),
    ]);

    logger.info('Deposit credited', { userId, amountUsd });
  }
}

module.exports = { createDepositIntent, handleStripeWebhook };
