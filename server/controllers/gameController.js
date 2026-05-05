'use strict';

const { playSlots, playRoulette, playBlackjack } = require('../services/gameService');
const prisma = require('../utils/prisma');

/**
 * GET /api/games
 * Returns a list of available games.
 */
async function listGames(_req, res) {
  const games = [
    { slug: 'slots', name: 'Slot Machine', description: 'Classic 3-reel slot machine', minBet: 0.5, maxBet: 500 },
    { slug: 'roulette', name: 'Roulette', description: 'European roulette wheel', minBet: 1, maxBet: 1000 },
    { slug: 'blackjack', name: 'Blackjack', description: 'Classic blackjack (simplified)', minBet: 1, maxBet: 500 },
  ];
  res.json(games);
}

/**
 * POST /api/games/slots
 */
async function playSlotGame(req, res, next) {
  try {
    const betAmount = parseFloat(req.body.betAmount);
    if (!betAmount || betAmount <= 0) {
      return res.status(400).json({ error: 'betAmount must be a positive number' });
    }

    const wallet = await prisma.wallet.findUnique({ where: { userId: req.user.id } });
    if (!wallet || parseFloat(wallet.balance) < betAmount) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    // Deduct bet, then credit payout
    const result = await playSlots(req.user.id, betAmount);
    await prisma.wallet.update({
      where: { userId: req.user.id },
      data: { balance: { increment: result.payout - betAmount } },
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/games/roulette
 */
async function playRouletteGame(req, res, next) {
  try {
    const { betAmount, bet } = req.body;
    if (!betAmount || betAmount <= 0 || bet === undefined) {
      return res.status(400).json({ error: 'betAmount and bet are required' });
    }

    const wallet = await prisma.wallet.findUnique({ where: { userId: req.user.id } });
    if (!wallet || parseFloat(wallet.balance) < betAmount) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    const result = await playRoulette(req.user.id, betAmount, bet);
    await prisma.wallet.update({
      where: { userId: req.user.id },
      data: { balance: { increment: result.payout - betAmount } },
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/games/blackjack
 */
async function playBlackjackGame(req, res, next) {
  try {
    const betAmount = parseFloat(req.body.betAmount);
    if (!betAmount || betAmount <= 0) {
      return res.status(400).json({ error: 'betAmount must be a positive number' });
    }

    const wallet = await prisma.wallet.findUnique({ where: { userId: req.user.id } });
    if (!wallet || parseFloat(wallet.balance) < betAmount) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    const result = await playBlackjack(req.user.id, betAmount);
    await prisma.wallet.update({
      where: { userId: req.user.id },
      data: { balance: { increment: result.payout - betAmount } },
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/games/history
 */
async function getHistory(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const skip = (page - 1) * limit;

    const [total, sessions] = await Promise.all([
      prisma.gameSession.count({ where: { userId: req.user.id } }),
      prisma.gameSession.findMany({
        where: { userId: req.user.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    res.json({ total, page, limit, sessions });
  } catch (err) {
    next(err);
  }
}

module.exports = { listGames, playSlotGame, playRouletteGame, playBlackjackGame, getHistory };
