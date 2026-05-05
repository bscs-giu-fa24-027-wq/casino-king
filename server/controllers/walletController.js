'use strict';

const prisma = require('../utils/prisma');

/**
 * GET /api/wallet
 */
async function getWallet(req, res, next) {
  try {
    const wallet = await prisma.wallet.upsert({
      where: { userId: req.user.id },
      update: {},
      create: { userId: req.user.id },
    });
    res.json(wallet);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/wallet/transactions
 */
async function getTransactions(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const skip = (page - 1) * limit;

    const [total, transactions] = await Promise.all([
      prisma.transaction.count({ where: { userId: req.user.id } }),
      prisma.transaction.findMany({
        where: { userId: req.user.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    res.json({ total, page, limit, transactions });
  } catch (err) {
    next(err);
  }
}

module.exports = { getWallet, getTransactions };
