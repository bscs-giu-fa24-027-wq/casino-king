'use strict';

/**
 * Leaderboard prize configuration.
 * Admin can edit prize amounts here; the values are read at runtime.
 *
 * Structure:
 *   prizes.<PERIOD>[rank] = CKC amount
 *
 * Ranks not listed receive 0 CKC.
 * For WEEKLY ranks 4-10, use the special key 'default_4_10'.
 */

const prizes = {
  WEEKLY: {
    1: 5000,
    2: 2000,
    3: 1000,
    default_4_10: 500, // ranks 4 through 10
  },
  MONTHLY: {
    1: 50000,
    2: 20000,
    3: 10000,
  },
};

/**
 * Returns the CKC prize for a given period and rank.
 * Returns 0 if the rank is not prized.
 *
 * @param {'WEEKLY'|'MONTHLY'} period
 * @param {number} rank
 * @returns {number}
 */
function getPrizeForRank(period, rank) {
  const config = prizes[period];
  if (!config) return 0;

  if (config[rank] !== undefined) return config[rank];

  if (period === 'WEEKLY' && rank >= 4 && rank <= 10) {
    return config.default_4_10 || 0;
  }

  return 0;
}

module.exports = { prizes, getPrizeForRank };
