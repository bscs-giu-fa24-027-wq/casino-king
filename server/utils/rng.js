'use strict';

/**
 * Cryptographically-safe random number generator helpers.
 * Uses Node's built-in crypto module to avoid predictable Math.random().
 */

const { randomBytes, randomInt } = require('crypto');

/**
 * Returns a random float in [0, 1) using 32 random bits.
 * @returns {number}
 */
function randomFloat() {
  const buf = randomBytes(4);
  const int = buf.readUInt32BE(0);
  return int / 0x100000000;
}

/**
 * Returns a random integer in the range [min, max] (inclusive).
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function randomIntInRange(min, max) {
  if (min > max) throw new RangeError('min must be <= max');
  return randomInt(min, max + 1);
}

/**
 * Simulates a slot machine spin.
 * Returns an array of `reels` random symbols chosen from `symbols`.
 * @param {string[]} symbols
 * @param {number} reels
 * @returns {string[]}
 */
function spinSlot(symbols, reels = 3) {
  if (!symbols || symbols.length === 0) throw new Error('symbols array must not be empty');
  return Array.from({ length: reels }, () => symbols[randomIntInRange(0, symbols.length - 1)]);
}

/**
 * Simulates a roulette spin.
 * Returns a number 0–36.
 * @returns {number}
 */
function spinRoulette() {
  return randomIntInRange(0, 36);
}

/**
 * Simulates drawing a card from a standard 52-card deck.
 * Returns an object { suit, value }.
 * @returns {{ suit: string, value: string }}
 */
function drawCard() {
  const suits = ['♠', '♥', '♦', '♣'];
  const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  return {
    suit: suits[randomIntInRange(0, suits.length - 1)],
    value: values[randomIntInRange(0, values.length - 1)],
  };
}

module.exports = { randomFloat, randomIntInRange, spinSlot, spinRoulette, drawCard };
