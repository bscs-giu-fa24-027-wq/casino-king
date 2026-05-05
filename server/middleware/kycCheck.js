'use strict';

const prisma = require('../utils/prisma');
const logger = require('../utils/logger');

/**
 * KYC (Know Your Customer) check middleware.
 * Ensures the authenticated user has an approved KYC status
 * before accessing protected financial/gaming routes.
 *
 * Must be used after `authenticate`.
 */
async function requireKyc(req, res, next) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { kycStatus: true, isActive: true },
    });

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    if (!user.isActive) {
      return res.status(403).json({ error: 'Account is suspended' });
    }

    if (user.kycStatus !== 'APPROVED') {
      return res.status(403).json({
        error: 'KYC verification required. Please complete identity verification.',
        kycStatus: user.kycStatus,
      });
    }

    next();
  } catch (err) {
    logger.error('KYC middleware error', { error: err.message });
    next(err);
  }
}

module.exports = requireKyc;
