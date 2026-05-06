'use strict';

const { Prisma } = require('@prisma/client');
const prisma = require('../utils/prisma');
const logger = require('../utils/logger');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Fetch the ResponsibleGambling record for a user, creating it on first access.
 * @param {string} userId
 * @returns {Promise<object>} ResponsibleGambling record
 */
async function getOrCreateRgRecord(userId) {
  let rg = await prisma.responsibleGambling.findUnique({ where: { userId } });
  if (!rg) {
    rg = await prisma.responsibleGambling.create({
      data: { userId },
    });
  }
  return rg;
}

/**
 * Returns true if the user is currently in a cooling-off period.
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
async function isCoolingOff(userId) {
  const rg = await prisma.responsibleGambling.findUnique({ where: { userId } });
  if (!rg || !rg.coolingOffUntil) return false;
  return new Date() < rg.coolingOffUntil;
}

/**
 * Returns true if the user is currently self-excluded.
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
async function isSelfExcluded(userId) {
  const rg = await prisma.responsibleGambling.findUnique({ where: { userId } });
  if (!rg || !rg.selfExcludedUntil) return false;
  return new Date() < rg.selfExcludedUntil;
}

/**
 * Throws a 403 error if the user is cooling-off or self-excluded.
 * Use `action` to produce a meaningful error message.
 *
 * @param {string} userId
 * @param {{ action?: string }} [options]
 * @throws {Error} 403 if restricted
 */
async function assertNotRestricted(userId, { action = 'perform this action' } = {}) {
  const rg = await prisma.responsibleGambling.findUnique({ where: { userId } });
  if (!rg) return; // No record means no restrictions

  const now = new Date();

  if (rg.selfExcludedUntil && now < rg.selfExcludedUntil) {
    const err = new Error(
      `Your account is self-excluded until ${rg.selfExcludedUntil.toISOString()}. ` +
        'You cannot ' + action + ' during this period.'
    );
    err.status = 403;
    throw err;
  }

  if (rg.coolingOffUntil && now < rg.coolingOffUntil) {
    const err = new Error(
      `You are in a cooling-off period until ${rg.coolingOffUntil.toISOString()}. ` +
        'You cannot ' + action + ' during this period.'
    );
    err.status = 403;
    throw err;
  }
}

// ─── Exported service functions ───────────────────────────────────────────────

/**
 * Returns the authenticated user's ResponsibleGambling settings,
 * creating the record on first access.
 *
 * @param {string} userId
 * @returns {Promise<object>}
 */
async function getSettings(userId) {
  return getOrCreateRgRecord(userId);
}

/**
 * Update deposit limits for a user.
 * Only lowering limits is allowed immediately; raising requires a 24-hour cool-off.
 *
 * @param {string} userId
 * @param {{ dailyDepositLimit?: number|string, weeklyDepositLimit?: number|string }} limits
 * @returns {Promise<object>} Updated ResponsibleGambling record
 */
async function updateLimits(userId, { dailyDepositLimit, weeklyDepositLimit } = {}) {
  const rg = await getOrCreateRgRecord(userId);

  const updates = {};

  if (dailyDepositLimit !== undefined && dailyDepositLimit !== null) {
    const newLimit = new Prisma.Decimal(dailyDepositLimit);
    if (newLimit.lessThanOrEqualTo(new Prisma.Decimal(0))) {
      const err = new Error('dailyDepositLimit must be a positive number');
      err.status = 400;
      throw err;
    }
    // If there is an existing limit, only allow lowering it
    if (rg.dailyDepositLimit !== null && newLimit.greaterThan(rg.dailyDepositLimit)) {
      const err = new Error(
        'You cannot raise your daily deposit limit immediately. ' +
          'Limit increases take effect after a 24-hour cool-off period as per responsible gambling policy.'
      );
      err.status = 403;
      throw err;
    }
    updates.dailyDepositLimit = newLimit;
  }

  if (weeklyDepositLimit !== undefined && weeklyDepositLimit !== null) {
    const newLimit = new Prisma.Decimal(weeklyDepositLimit);
    if (newLimit.lessThanOrEqualTo(new Prisma.Decimal(0))) {
      const err = new Error('weeklyDepositLimit must be a positive number');
      err.status = 400;
      throw err;
    }
    // If there is an existing limit, only allow lowering it
    if (rg.weeklyDepositLimit !== null && newLimit.greaterThan(rg.weeklyDepositLimit)) {
      const err = new Error(
        'You cannot raise your weekly deposit limit immediately. ' +
          'Limit increases take effect after a 24-hour cool-off period as per responsible gambling policy.'
      );
      err.status = 403;
      throw err;
    }
    updates.weeklyDepositLimit = newLimit;
  }

  if (Object.keys(updates).length === 0) {
    const err = new Error('No valid limit fields provided (dailyDepositLimit, weeklyDepositLimit)');
    err.status = 400;
    throw err;
  }

  const updated = await prisma.responsibleGambling.update({
    where: { userId },
    data: updates,
  });

  logger.info('Deposit limits updated', { userId, updates: Object.keys(updates) });
  return updated;
}

/**
 * Set a cooling-off period for the user.
 * During this time all gameplay and deposits are blocked.
 *
 * @param {string} userId
 * @param {24|48|72|168} hours
 * @returns {Promise<object>} Updated ResponsibleGambling record
 */
async function setCoolingOff(userId, hours) {
  const VALID_HOURS = [24, 48, 72, 168];
  if (!VALID_HOURS.includes(hours)) {
    const err = new Error(`hours must be one of: ${VALID_HOURS.join(', ')}`);
    err.status = 400;
    throw err;
  }

  await getOrCreateRgRecord(userId);

  const coolingOffUntil = new Date(Date.now() + hours * 60 * 60 * 1000);

  const updated = await prisma.responsibleGambling.update({
    where: { userId },
    data: { coolingOffUntil },
  });

  logger.info('Cooling-off period set', { userId, hours, until: coolingOffUntil.toISOString() });
  return updated;
}

/**
 * Apply a self-exclusion period, immediately suspending the user account.
 * Cannot be reversed by the user — admin only.
 *
 * @param {string} userId
 * @param {1|3|6|12} months
 * @returns {Promise<object>} Updated ResponsibleGambling record
 */
async function selfExclude(userId, months) {
  const VALID_MONTHS = [1, 3, 6, 12];
  if (!VALID_MONTHS.includes(months)) {
    const err = new Error(`months must be one of: ${VALID_MONTHS.join(', ')}`);
    err.status = 400;
    throw err;
  }

  await getOrCreateRgRecord(userId);

  const selfExcludedUntil = new Date();
  selfExcludedUntil.setUTCMonth(selfExcludedUntil.getUTCMonth() + months);

  // Atomically update RG record and suspend the user account
  const [updated] = await prisma.$transaction([
    prisma.responsibleGambling.update({
      where: { userId },
      data: { selfExcludedUntil },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { status: 'SUSPENDED' },
    }),
  ]);

  logger.info('Self-exclusion applied', { userId, months, until: selfExcludedUntil.toISOString() });
  return updated;
}

module.exports = {
  getOrCreateRgRecord,
  isCoolingOff,
  isSelfExcluded,
  assertNotRestricted,
  getSettings,
  updateLimits,
  setCoolingOff,
  selfExclude,
};
