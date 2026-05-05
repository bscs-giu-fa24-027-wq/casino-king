'use strict';

const prisma = require('../utils/prisma');
const { spinSlot, spinRoulette, drawCard } = require('../utils/rng');

const SLOT_SYMBOLS = ['🍒', '🍋', '🍊', '🍇', '⭐', '💎', '7️⃣'];

/**
 * Play a slot machine round.
 * @param {string} userId
 * @param {number} betAmount
 * @returns {Promise<{ reels: string[], payout: number, multiplier: number }>}
 */
async function playSlots(userId, betAmount) {
  const reels = spinSlot(SLOT_SYMBOLS, 3);

  // Simple payout: all three match → 10x; two match → 2x; else 0
  let multiplier = 0;
  if (reels[0] === reels[1] && reels[1] === reels[2]) {
    multiplier = reels[0] === '💎' ? 50 : reels[0] === '7️⃣' ? 20 : 10;
  } else if (reels[0] === reels[1] || reels[1] === reels[2] || reels[0] === reels[2]) {
    multiplier = 2;
  }

  const payout = parseFloat((betAmount * multiplier).toFixed(2));

  await prisma.gameSession.create({
    data: {
      userId,
      gameSlug: 'slots',
      betAmount,
      outcome: { reels },
      payout,
    },
  });

  return { reels, payout, multiplier };
}

/**
 * Play a roulette round.
 * @param {string} userId
 * @param {number} betAmount
 * @param {'red'|'black'|'green'|number} bet
 * @returns {Promise<{ result: number, color: string, payout: number }>}
 */
async function playRoulette(userId, betAmount, bet) {
  const result = spinRoulette();
  const RED_NUMBERS = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
  const color = result === 0 ? 'green' : RED_NUMBERS.includes(result) ? 'red' : 'black';

  let payout = 0;
  if (bet === 'green' && color === 'green') payout = betAmount * 35;
  else if (bet === 'red' && color === 'red') payout = betAmount * 2;
  else if (bet === 'black' && color === 'black') payout = betAmount * 2;
  else if (typeof bet === 'number' && bet === result) payout = betAmount * 36;

  await prisma.gameSession.create({
    data: {
      userId,
      gameSlug: 'roulette',
      betAmount,
      outcome: { result, color, bet },
      payout,
    },
  });

  return { result, color, payout };
}

/**
 * Play a blackjack hand (simplified).
 * @param {string} userId
 * @param {number} betAmount
 * @returns {Promise<{ playerCards: object[], dealerCards: object[], playerTotal: number, dealerTotal: number, result: string, payout: number }>}
 */
async function playBlackjack(userId, betAmount) {
  const cardValue = (card) => {
    if (['J', 'Q', 'K'].includes(card.value)) return 10;
    if (card.value === 'A') return 11;
    return parseInt(card.value, 10);
  };

  const playerCards = [drawCard(), drawCard()];
  const dealerCards = [drawCard(), drawCard()];

  const playerTotal = playerCards.reduce((s, c) => s + cardValue(c), 0);
  const dealerTotal = dealerCards.reduce((s, c) => s + cardValue(c), 0);

  let result, payout;
  if (playerTotal === 21) { result = 'blackjack'; payout = betAmount * 2.5; }
  else if (dealerTotal === 21) { result = 'dealer_blackjack'; payout = 0; }
  else if (playerTotal > 21) { result = 'bust'; payout = 0; }
  else if (dealerTotal > 21 || playerTotal > dealerTotal) { result = 'win'; payout = betAmount * 2; }
  else if (playerTotal === dealerTotal) { result = 'push'; payout = betAmount; }
  else { result = 'lose'; payout = 0; }

  await prisma.gameSession.create({
    data: {
      userId,
      gameSlug: 'blackjack',
      betAmount,
      outcome: { playerCards, dealerCards, playerTotal, dealerTotal, result },
      payout,
    },
  });

  return { playerCards, dealerCards, playerTotal, dealerTotal, result, payout };
}

module.exports = { playSlots, playRoulette, playBlackjack };
