'use strict';

const crypto = require('crypto');
const { Prisma } = require('@prisma/client');
const prisma = require('../utils/prisma');
const logger = require('../utils/logger');
const { triggerRoundsPlayed, triggerWager, triggerWinStreak } = require('./missionService');
const tokenService = require('./tokenService');
const { updateLeaderboard } = require('./leaderboardService');
const vipService = require('./vipService');
const rgService = require('./responsibleGamblingService');
const { createNotification } = require('./notificationService');

// ─── Card Utilities ───────────────────────────────────────────────────────────

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function buildDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

function shuffleDeck(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function dealCards(deck, n) {
  return deck.splice(0, n);
}

function handTotal(cards) {
  let total = 0;
  let aces = 0;
  for (const card of cards) {
    if (['J', 'Q', 'K'].includes(card.rank)) total += 10;
    else if (card.rank === 'A') { aces++; total += 11; }
    else total += parseInt(card.rank, 10);
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

// ─── RNG Helpers ──────────────────────────────────────────────────────────────

/** Returns a cryptographically random integer in [min, max] (inclusive). */
function randInt(min, max) {
  return crypto.randomInt(min, max + 1);
}

/** Returns a cryptographically random float in [0, 1). */
function randFloat() {
  const buf = crypto.randomBytes(4);
  return buf.readUInt32BE(0) / 0x100000000;
}

// ─── SLOTS ────────────────────────────────────────────────────────────────────

function playSlots(stake) {
  // Weighted: 60% lose(0x), 20% 1x, 10% 2x, 7% 3-5x, 3% 5-10x
  const roll = randFloat() * 100;
  let multiplier;
  let outcome;
  if (roll < 60) {
    multiplier = 0;
    outcome = 'lose';
  } else if (roll < 80) {
    multiplier = 1;
    outcome = 'win_1x';
  } else if (roll < 90) {
    multiplier = 2;
    outcome = 'win_2x';
  } else if (roll < 97) {
    multiplier = randInt(3, 5);
    outcome = `win_${multiplier}x`;
  } else {
    multiplier = randInt(6, 10);
    outcome = `win_${multiplier}x`;
  }
  const payoutCkc = stake.mul(new Prisma.Decimal(multiplier));
  return {
    outcome,
    multiplier,
    payoutCkc,
    rngResult: { roll: parseFloat(roll.toFixed(6)), multiplier, outcome },
  };
}

// ─── DICE ─────────────────────────────────────────────────────────────────────

function playDice(stake, body) {
  const { prediction } = body;
  if (!['high', 'low'].includes(prediction)) {
    const err = new Error('prediction must be "high" or "low"');
    err.status = 400;
    throw err;
  }
  const roll = randInt(1, 100);
  const isHigh = roll > 50;
  const won = (prediction === 'high' && isHigh) || (prediction === 'low' && !isHigh);
  const multiplier = won ? 1.96 : 0;
  const outcome = won ? 'win' : 'lose';
  const payoutCkc = stake.mul(new Prisma.Decimal(multiplier));
  return {
    outcome,
    multiplier,
    payoutCkc,
    rngResult: { roll, prediction, isHigh, won },
  };
}

// ─── ROULETTE ─────────────────────────────────────────────────────────────────

const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

function playRoulette(stake, body) {
  const { betType, betValue } = body;
  if (!betType) {
    const err = new Error('betType is required for roulette');
    err.status = 400;
    throw err;
  }
  const spin = randInt(0, 36);
  const color = spin === 0 ? 'green' : RED_NUMBERS.has(spin) ? 'red' : 'black';
  const isEven = spin !== 0 && spin % 2 === 0;

  let won = false;
  let multiplier = 0;

  switch (betType) {
    case 'number': {
      const betNum = parseInt(betValue, 10);
      if (isNaN(betNum) || betNum < 0 || betNum > 36) {
        const err = new Error('betValue must be a number between 0 and 36');
        err.status = 400;
        throw err;
      }
      won = spin === betNum;
      multiplier = won ? 35 : 0;
      break;
    }
    case 'red':
      won = color === 'red';
      multiplier = won ? 2 : 0;
      break;
    case 'black':
      won = color === 'black';
      multiplier = won ? 2 : 0;
      break;
    case 'even':
      won = isEven;
      multiplier = won ? 2 : 0;
      break;
    case 'odd':
      won = spin !== 0 && !isEven;
      multiplier = won ? 2 : 0;
      break;
    default: {
      const err = new Error('betType must be number|red|black|even|odd');
      err.status = 400;
      throw err;
    }
  }

  const outcome = won ? 'win' : 'lose';
  const payoutCkc = stake.mul(new Prisma.Decimal(multiplier));
  return {
    outcome,
    multiplier,
    payoutCkc,
    rngResult: { spin, color, isEven, betType, betValue, won },
  };
}

// ─── BLACKJACK ────────────────────────────────────────────────────────────────

function playBlackjack(stake) {
  const deck = shuffleDeck(buildDeck());
  const playerCards = dealCards(deck, 2);
  const dealerCards = dealCards(deck, 2);

  let playerTotal = handTotal(playerCards);
  let dealerTotal = handTotal(dealerCards);

  // Dealer hits to 16, stands at 17+
  while (dealerTotal < 17) {
    dealerCards.push(dealCards(deck, 1)[0]);
    dealerTotal = handTotal(dealerCards);
  }

  const playerBJ = playerTotal === 21 && playerCards.length === 2;
  const dealerBJ = dealerTotal === 21 && dealerCards.length === 2;

  let outcome, multiplier;
  if (playerBJ && !dealerBJ) {
    outcome = 'blackjack';
    multiplier = 2.5;
  } else if (dealerBJ && !playerBJ) {
    outcome = 'dealer_blackjack';
    multiplier = 0;
  } else if (playerTotal > 21) {
    outcome = 'bust';
    multiplier = 0;
  } else if (dealerTotal > 21 || playerTotal > dealerTotal) {
    outcome = 'win';
    multiplier = 2;
  } else if (playerTotal === dealerTotal) {
    outcome = 'push';
    multiplier = 1;
  } else {
    outcome = 'lose';
    multiplier = 0;
  }

  const payoutCkc = stake.mul(new Prisma.Decimal(multiplier));
  return {
    outcome,
    multiplier,
    payoutCkc,
    rngResult: { playerCards, dealerCards, playerTotal, dealerTotal },
  };
}

// ─── BACCARAT ─────────────────────────────────────────────────────────────────

function baccaratCardValue(card) {
  if (['J', 'Q', 'K', '10'].includes(card.rank)) return 0;
  if (card.rank === 'A') return 1;
  return parseInt(card.rank, 10);
}

function baccaratTotal(cards) {
  return cards.reduce((sum, c) => sum + baccaratCardValue(c), 0) % 10;
}

function playBaccarat(stake, body) {
  const { bet } = body;
  if (!['player', 'banker', 'tie'].includes(bet)) {
    const err = new Error('bet must be "player", "banker", or "tie"');
    err.status = 400;
    throw err;
  }

  const deck = shuffleDeck(buildDeck());
  const playerCards = dealCards(deck, 2);
  const bankerCards = dealCards(deck, 2);

  let playerTotal = baccaratTotal(playerCards);
  let bankerTotal = baccaratTotal(bankerCards);

  const isNatural = playerTotal >= 8 || bankerTotal >= 8;

  if (!isNatural) {
    let playerThirdCard = null;
    if (playerTotal <= 5) {
      playerThirdCard = dealCards(deck, 1)[0];
      playerCards.push(playerThirdCard);
      playerTotal = baccaratTotal(playerCards);
    }

    if (playerThirdCard === null) {
      if (bankerTotal <= 5) {
        bankerCards.push(dealCards(deck, 1)[0]);
        bankerTotal = baccaratTotal(bankerCards);
      }
    } else {
      const p3v = baccaratCardValue(playerThirdCard);
      const bankerDraws =
        bankerTotal <= 2 ||
        (bankerTotal === 3 && p3v !== 8) ||
        (bankerTotal === 4 && [2, 3, 4, 5, 6, 7].includes(p3v)) ||
        (bankerTotal === 5 && [4, 5, 6, 7].includes(p3v)) ||
        (bankerTotal === 6 && [6, 7].includes(p3v));
      if (bankerDraws) {
        bankerCards.push(dealCards(deck, 1)[0]);
        bankerTotal = baccaratTotal(bankerCards);
      }
    }
  }

  let winner;
  if (playerTotal > bankerTotal) winner = 'player';
  else if (bankerTotal > playerTotal) winner = 'banker';
  else winner = 'tie';

  const won = bet === winner;
  const multiplier = bet === 'tie' ? (won ? 8 : 0) : (won ? 2 : 0);
  const outcome = won ? 'win' : 'lose';
  const payoutCkc = stake.mul(new Prisma.Decimal(multiplier));
  return {
    outcome,
    multiplier,
    payoutCkc,
    rngResult: { playerCards, bankerCards, playerTotal, bankerTotal, winner, bet },
  };
}

// ─── CRASH ────────────────────────────────────────────────────────────────────

function playCrash(stake, body) {
  const { cashOutAt } = body;
  const cashOut = parseFloat(cashOutAt);
  if (!cashOutAt || isNaN(cashOut)) {
    const err = new Error('cashOutAt is required and must be a valid number for crash game');
    err.status = 400;
    throw err;
  }
  if (cashOut < 1) {
    const err = new Error('cashOutAt must be >= 1');
    err.status = 400;
    throw err;
  }

  // Exponential distribution in range [1, 100]
  // u ∈ [0, 1): crashPoint = 1 / (1 - u * 0.99), clamped to [1, 100]
  const u = randFloat();
  const crashPoint = Math.min(100, Math.max(1, 1 / (1 - u * 0.99)));

  const won = cashOut <= crashPoint;
  const multiplier = won ? cashOut : 0;
  const outcome = won ? 'win' : 'lose';
  const payoutCkc = stake.mul(new Prisma.Decimal(multiplier));
  return {
    outcome,
    multiplier,
    payoutCkc,
    rngResult: { crashPoint: parseFloat(crashPoint.toFixed(4)), cashOutAt: cashOut, won },
  };
}

// ─── LOTTO ────────────────────────────────────────────────────────────────────

function playLotto(stake) {
  // 1/1000 jackpot(500x), 1/100 second(50x), 1/20 third(5x), else lose
  const roll = randInt(1, 1000);
  let multiplier, outcome;
  if (roll === 1) {
    multiplier = 500;
    outcome = 'jackpot';
  } else if (roll <= 10) {
    multiplier = 50;
    outcome = 'second_prize';
  } else if (roll <= 50) {
    multiplier = 5;
    outcome = 'third_prize';
  } else {
    multiplier = 0;
    outcome = 'lose';
  }
  const payoutCkc = stake.mul(new Prisma.Decimal(multiplier));
  return {
    outcome,
    multiplier,
    payoutCkc,
    rngResult: { roll, multiplier, outcome },
  };
}

// ─── POKER ────────────────────────────────────────────────────────────────────

const RANK_ORDER = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const rankValue = (r) => RANK_ORDER.indexOf(r);

function evaluatePoker(cards) {
  const values = cards.map((c) => rankValue(c.rank)).sort((a, b) => a - b);
  const suits = cards.map((c) => c.suit);

  const isFlush = suits.every((s) => s === suits[0]);
  const isAceLowStraight = (vals) =>
    vals[0] === 0 && vals[1] === 1 && vals[2] === 2 && vals[3] === 3 && vals[4] === 12;
  const isStraight =
    values.every((v, i) => i === 0 || v === values[i - 1] + 1) ||
    isAceLowStraight(values);

  const counts = {};
  for (const v of values) counts[v] = (counts[v] || 0) + 1;
  const freq = Object.values(counts).sort((a, b) => b - a);

  if (isFlush && isStraight) {
    // Royal flush: 10-J-Q-K-A (values 8,9,10,11,12)
    if (values[0] === 8 && values[4] === 12) return { hand: 'royal_flush', multiplier: 250 };
    return { hand: 'straight_flush', multiplier: 50 };
  }
  if (freq[0] === 4) return { hand: 'four_of_a_kind', multiplier: 25 };
  if (freq[0] === 3 && freq[1] === 2) return { hand: 'full_house', multiplier: 9 };
  if (isFlush) return { hand: 'flush', multiplier: 6 };
  if (isStraight) return { hand: 'straight', multiplier: 4 };
  if (freq[0] === 3) return { hand: 'three_of_a_kind', multiplier: 3 };
  if (freq[0] === 2 && freq[1] === 2) return { hand: 'two_pair', multiplier: 2 };
  if (freq[0] === 2) return { hand: 'pair', multiplier: 1 };
  return { hand: 'high_card', multiplier: 0 };
}

function playPoker(stake) {
  const deck = shuffleDeck(buildDeck());
  const hand = dealCards(deck, 5);
  const { hand: handName, multiplier } = evaluatePoker(hand);
  const outcome = multiplier > 0 ? 'win' : 'lose';
  const payoutCkc = stake.mul(new Prisma.Decimal(multiplier));
  return {
    outcome,
    multiplier,
    payoutCkc,
    rngResult: { hand, handName, multiplier },
  };
}

// ─── Main Play Function ───────────────────────────────────────────────────────

async function playGame(userId, gameId, body) {
  // 1. Find game
  const game = await prisma.game.findUnique({ where: { id: gameId } });
  if (!game || !game.isActive) {
    const err = new Error('Game not found or inactive');
    err.status = 404;
    throw err;
  }

  // 1a. Enforce exclusive game access (Gold tier and above required)
  if (game.isExclusive) {
    const canAccess = await vipService.hasGoldAccess(userId);
    if (!canAccess) {
      const err = new Error('This game is exclusive to Gold VIP members and above');
      err.status = 403;
      throw err;
    }
  }

  // 1b. Responsible gambling: cooling-off / self-exclusion
  await rgService.assertNotRestricted(userId, { action: 'play games' });

  // 2. Validate stake
  const { stakeCkc, clientSeed } = body;
  if (stakeCkc === undefined || stakeCkc === null || stakeCkc === '') {
    const err = new Error('stakeCkc is required');
    err.status = 400;
    throw err;
  }
  const stakeDecimal = new Prisma.Decimal(stakeCkc);
  if (stakeDecimal.lessThan(new Prisma.Decimal(game.minStake))) {
    const err = new Error(`Minimum stake is ${game.minStake} CKC`);
    err.status = 400;
    throw err;
  }
  if (stakeDecimal.greaterThan(new Prisma.Decimal(game.maxStake))) {
    const err = new Error(`Maximum stake is ${game.maxStake} CKC`);
    err.status = 400;
    throw err;
  }

  // 3. Deduct stake from wallet
  await tokenService.stakeCkc(userId, stakeDecimal);

  // 4. Generate RNG seed
  const rngSeed = crypto.randomBytes(32).toString('hex');

  // 5. Run game logic
  let gameResult;
  switch (game.category) {
    case 'SLOTS':     gameResult = playSlots(stakeDecimal, body);     break;
    case 'DICE':      gameResult = playDice(stakeDecimal, body);      break;
    case 'ROULETTE':  gameResult = playRoulette(stakeDecimal, body);  break;
    case 'BLACKJACK': gameResult = playBlackjack(stakeDecimal, body); break;
    case 'BACCARAT':  gameResult = playBaccarat(stakeDecimal, body);  break;
    case 'CRASH':     gameResult = playCrash(stakeDecimal, body);     break;
    case 'LOTTO':     gameResult = playLotto(stakeDecimal, body);     break;
    case 'POKER':     gameResult = playPoker(stakeDecimal, body);     break;
    default: {
      const err = new Error(`Unsupported game category: ${game.category}`);
      err.status = 400;
      throw err;
    }
  }

  const { outcome, payoutCkc, rngResult } = gameResult;

  // Include clientSeed in rngResult if provided (provably fair)
  if (clientSeed) rngResult.clientSeed = clientSeed;

  // 6. Create GameRound row
  const round = await prisma.gameRound.create({
    data: {
      userId,
      gameId,
      stakeCkc: stakeDecimal,
      payoutCkc,
      outcome,
      rngSeed,
      rngResult,
    },
  });

  // 7. Credit win if payout > 0
  let newWallet;
  if (payoutCkc.greaterThan(new Prisma.Decimal(0))) {
    newWallet = await tokenService.creditWin(userId, payoutCkc, round.id);

    // Send big win notification if payout > 10x stake (best-effort)
    const bigWinThreshold = stakeDecimal.mul(new Prisma.Decimal(10));
    if (payoutCkc.greaterThan(bigWinThreshold)) {
      createNotification(userId, {
        title: '🎉 Big Win!',
        message: `Incredible! You won ${payoutCkc.toFixed(0)} CKC — that's ${gameResult.multiplier}x your stake on ${game.name}!`,
        type: 'WIN',
      }).catch((err) => logger.warn('Big win notification failed', { userId, error: err.message }));
    }
  } else {
    newWallet = await tokenService.getWalletBalance(userId);
  }

  // 8. Update UserVip.totalWagered
  const stakeInt = Math.round(stakeDecimal.toNumber());
  await prisma.userVip.updateMany({
    where: { userId },
    data: { totalWagered: { increment: stakeInt } },
  });

  // 8a. Check for VIP tier upgrade (best-effort, non-blocking)
  void vipService.checkVipUpgrade(userId).catch((err) =>
    logger.warn('VIP upgrade check failed', { userId, error: err.message })
  );

  // 9. Update Leaderboard for current week and month
  await Promise.all([
    updateLeaderboard(userId, stakeInt, 'WEEKLY'),
    updateLeaderboard(userId, stakeInt, 'MONTHLY'),
  ]);

  logger.info('Game played', {
    userId,
    gameId,
    roundId: round.id,
    category: game.category,
    stakeCkc: stakeDecimal.toFixed(0),
    payoutCkc: payoutCkc.toFixed(0),
    outcome,
  });

  // ─── Mission Triggers (best-effort) ─────────────────────────────────────────
  const isWin = payoutCkc.greaterThan(new Prisma.Decimal(0));
  Promise.all([
    triggerRoundsPlayed(userId),
    triggerWager(userId, stakeDecimal),
    triggerWinStreak(userId, isWin),
  ]).catch((err) => logger.warn('Mission trigger failed', { userId, error: err.message }));

  return {
    outcome,
    stakeCkc: stakeDecimal,
    payoutCkc,
    rngSeed,
    rngResult,
    newBalance: newWallet.ckcBalance,
  };
}

// ─── List / Detail / History ──────────────────────────────────────────────────

async function getActiveGames() {
  return prisma.game.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
}

async function getGameById(gameId) {
  const game = await prisma.game.findUnique({ where: { id: gameId } });
  if (!game) {
    const err = new Error('Game not found');
    err.status = 404;
    throw err;
  }
  return game;
}

async function getGameHistory(userId, { limit = 20, offset = 0 } = {}) {
  const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const parsedOffset = Math.max(0, parseInt(offset, 10) || 0);

  const [rounds, total] = await Promise.all([
    prisma.gameRound.findMany({
      where: { userId },
      orderBy: { playedAt: 'desc' },
      skip: parsedOffset,
      take: parsedLimit,
      include: { game: { select: { name: true, category: true } } },
    }),
    prisma.gameRound.count({ where: { userId } }),
  ]);

  return { rounds, total, limit: parsedLimit, offset: parsedOffset };
}

module.exports = { playGame, getActiveGames, getGameById, getGameHistory };
