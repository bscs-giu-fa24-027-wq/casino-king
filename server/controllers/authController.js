'use strict';

const bcrypt = require('bcrypt');
const prisma = require('../utils/prisma');
const { signToken } = require('../services/tokenService');
const { checkDailyBonus } = require('../services/bonusService');
const logger = require('../utils/logger');

const SALT_ROUNDS = 12;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getBlockedCountries() {
  return (process.env.BLOCKED_COUNTRIES || '')
    .split(',')
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
}

function isBlocked(countryCode) {
  const list = getBlockedCountries();
  return list.length > 0 && list.includes((countryCode || '').toUpperCase());
}

function isAtLeast18(dob) {
  const now = new Date();
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return false;
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age >= 18;
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
} catch (_) {
  // ioredis not installed — Redis blocklist is a no-op
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

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    if (!validatePassword(password)) {
      return res.status(400).json({
        error: 'Password must be at least 8 characters and contain at least one letter and one number',
      });
    }

    if (!isAtLeast18(dateOfBirth)) {
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

      await tx.notification.create({
        data: {
          userId: newUser.id,
          title: 'Welcome to Casino King!',
          message: `Welcome, ${fullName}! Your account has been created successfully.`,
          type: 'SYSTEM',
        },
      });

      return newUser;
    });

    const token = signToken(user);
    logger.info('User registered', { userId: user.id, email: user.email });

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
      await checkDailyBonus(user.id);
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
        const jwt = require('jsonwebtoken');
        const decoded = jwt.decode(token);
        const ttl = decoded?.exp ? decoded.exp - Math.floor(Date.now() / 1000) : 3600;
        if (ttl > 0) {
          await redisClient.set(`blocklist:${token}`, '1', 'EX', ttl);
        }
      } catch (_) {
        // best-effort: ignore Redis errors
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
