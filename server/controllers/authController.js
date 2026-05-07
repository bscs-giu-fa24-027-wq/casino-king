'use strict';

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const prisma = require('../utils/prisma');
const { signToken } = require('../services/jwtService');
const { checkDailyBonus } = require('../services/bonusService');
const { claimReferral } = require('../services/referralService');
const { createNotification } = require('../services/notificationService');
const { checkAge, isCountryBlocked } = require('../middleware/geofence');
const logger = require('../utils/logger');

const SALT_ROUNDS = 12;
const DEFAULT_LOGOUT_TTL_SECONDS = 3600;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isBlocked(countryCode) {
  return isCountryBlocked((countryCode || '').toUpperCase());
}

function validatePassword(password) {
  if (!password || password.length < 8) return false;
  if (!/[a-zA-Z]/.test(password)) return false;
  if (!/[0-9]/.test(password)) return false;
  return true;
}

/** Strip passwordHash from any user object before sending to client. */
function safeUser(user) {
  const { passwordHash, ...rest } = user;
  return rest;
}

// Best-effort Redis client for logout blocklist
let redisClient = null;
try {
  if (process.env.REDIS_URL) {
    // eslint-disable-next-line import/no-extraneous-dependencies
    const Redis = require('ioredis');
    redisClient = new Redis(process.env.REDIS_URL, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 0,
    });
  }
} catch (initErr) {
  logger.debug('Redis unavailable — logout blocklist is a no-op', { error: initErr.message });
}

// ─── Controllers ──────────────────────────────────────────────────────────────

/**
 * POST /api/auth/register
 */
async function register(req, res, next) {
  try {
    const { email, password, fullName, countryCode, dateOfBirth } = req.body;

    // Required field validation
    if (!email || !password || !fullName || !countryCode || !dateOfBirth) {
      return res.status(400).json({
        error: 'email, password, fullName, countryCode, and dateOfBirth are required',
      });
    }

    // Simple linear-time email format check (avoids ReDoS)
    const atIdx = email.indexOf('@');
    const dotIdx = email.lastIndexOf('.');
    if (atIdx < 1 || dotIdx <= atIdx + 1 || dotIdx >= email.length - 1) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    if (!validatePassword(password)) {
      return res.status(400).json({
        error: 'Password must be at least 8 characters and contain at least one letter and one number',
      });
    }

    if (!checkAge(dateOfBirth)) {
      return res.status(400).json({ error: 'You must be at least 18 years old to register' });
    }

    // Geofencing
    if (isBlocked(countryCode)) {
      return res.status(451).json({
        error: 'Service unavailable in your region due to regulatory requirements.',
      });
    }

    // Duplicate check
    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Look up Bronze VIP tier (seeded in Step 2)
    const bronzeTier = await prisma.vipTier.findFirst({ where: { name: 'Bronze' } });

    // Atomic: User + Wallet + UserVip + welcome Notification
    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: email.toLowerCase(),
          passwordHash,
          fullName,
          countryCode: countryCode.toUpperCase(),
          dateOfBirth: new Date(dateOfBirth),
        },
      });

      await tx.wallet.create({ data: { userId: newUser.id } });

      if (bronzeTier) {
        await tx.userVip.create({ data: { userId: newUser.id, tierId: bronzeTier.id } });
      }

      return newUser;
    });

    // Send welcome notification (best-effort, outside transaction)
    try {
      await createNotification(user.id, {
        title: 'Welcome to Casino King!',
        message: `Welcome, ${fullName}! Your account has been created successfully.`,
        type: 'SYSTEM',
      });
    } catch (notifErr) {
      logger.warn('Welcome notification failed', { userId: user.id, error: notifErr.message });
    }

    const token = signToken(user);
    logger.info('User registered', { userId: user.id, email: user.email });

    // If user registered via a referral link, record the referral (best-effort)
    const refParam = req.query.ref || req.body.ref;
    if (refParam && refParam !== user.id) {
      try {
        await claimReferral(refParam, user.id);
      } catch (refErr) {
        logger.warn('Referral claim failed on register', { ref: refParam, userId: user.id, error: refErr.message });
      }
    }

    return res.status(201).json({ token, user: safeUser(user) });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/login
 */
async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        wallet: true,
        userVip: { include: { tier: true } },
      },
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (user.status !== 'ACTIVE') {
      return res.status(403).json({ error: 'Account is suspended or banned' });
    }

    // Geofence re-check on login
    if (isBlocked(user.countryCode)) {
      return res.status(451).json({
        error: 'Service unavailable in your region due to regulatory requirements.',
      });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update lastLoginAt
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    // Award daily login bonus (best-effort)
    try {
      const bonusResult = await checkDailyBonus(user.id);
      if (bonusResult) {
        await createNotification(user.id, {
          title: 'Daily Login Bonus!',
          message: `You earned ${bonusResult.ckcAwarded} CKC for your day ${bonusResult.streakDays} login streak!`,
          type: 'BONUS',
        });
      }
    } catch (bonusErr) {
      logger.warn('Daily bonus check failed', { userId: user.id, error: bonusErr.message });
    }

    // Reload wallet to reflect any bonus increment
    const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });

    const token = signToken(user);
    logger.info('User logged in', { userId: user.id });

    return res.json({
      token,
      user: safeUser(user),
      wallet: { ckcBalance: wallet ? wallet.ckcBalance : 0 },
      vipTier: user.userVip?.tier || null,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/logout
 * Invalidates the bearer token by adding it to a Redis blocklist (best-effort).
 */
async function logout(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ') && redisClient) {
      const token = authHeader.slice(7);
      try {
        const decoded = jwt.decode(token);
        const ttl = decoded?.exp ? decoded.exp - Math.floor(Date.now() / 1000) : DEFAULT_LOGOUT_TTL_SECONDS;
        if (ttl > 0) {
          await redisClient.set(`blocklist:${token}`, '1', 'EX', ttl);
        }
      } catch (redisErr) {
        logger.debug('Redis blocklist set failed during logout', { error: redisErr.message });
      }
    }
    return res.json({ message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/auth/me  (protected)
 */
async function me(req, res, next) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        wallet: true,
        userVip: { include: { tier: true } },
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({
      user: safeUser(user),
      wallet: user.wallet,
      vipTier: user.userVip?.tier || null,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/change-password  (protected)
 */
async function changePassword(req, res, next) {
  try {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: 'oldPassword and newPassword are required' });
    }

    if (!validatePassword(newPassword)) {
      return res.status(400).json({
        error: 'New password must be at least 8 characters and contain at least one letter and one number',
      });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const valid = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Old password is incorrect' });
    }

    const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: newHash } });

    logger.info('Password changed', { userId: user.id });
    return res.json({ message: 'Password updated successfully' });
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login, logout, me, changePassword };
