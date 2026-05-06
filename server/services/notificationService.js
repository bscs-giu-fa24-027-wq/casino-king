'use strict';

const prisma = require('../utils/prisma');
const logger = require('../utils/logger');

// Valid notification types matching the Prisma enum
const VALID_TYPES = ['BONUS', 'WIN', 'KYC', 'SYSTEM', 'PROMO'];

/**
 * Create a notification record for a user.
 *
 * @param {string} userId
 * @param {{ title: string, message: string, type: string }} options
 * @returns {Promise<object>} created Notification record
 */
async function createNotification(userId, { title, message, type }) {
  if (!VALID_TYPES.includes(type)) {
    throw Object.assign(
      new Error(`Invalid notification type: ${type}. Must be one of ${VALID_TYPES.join(', ')}`),
      { status: 400 }
    );
  }

  const notification = await prisma.notification.create({
    data: { userId, title, message, type },
  });

  logger.debug('Notification created', { userId, type, title });
  return notification;
}

module.exports = { createNotification };
