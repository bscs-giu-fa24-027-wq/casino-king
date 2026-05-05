'use strict';

const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getBlockedCountries() {
  return (process.env.BLOCKED_COUNTRIES || '')
    .split(',')
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
}

// Best-effort Redis client for token blocklist checking
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
  // ioredis not installed — blocklist check is a no-op
}

// ─── Middleware ───────────────────────────────────────────────────────────────

/**
 * verifyToken: Extract Bearer JWT, verify signature, check Redis blocklist,
 * then attach decoded payload to req.user.
 */
async function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // Check Redis blocklist (best-effort)
    if (redisClient) {
      try {
        const blocked = await redisClient.get(`blocklist:${token}`);
        if (blocked) {
          return res.status(401).json({ error: 'Token has been revoked' });
        }
      } catch (_) {
        // Redis unavailable — proceed without blocklist check
      }
    }

    req.user = payload;
    next();
  } catch (err) {
    logger.warn('JWT verification failed', { error: err.message });
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/** Alias kept for backward compatibility with other routes. */
const authenticate = verifyToken;

/**
 * requireAdmin: Block if role !== ADMIN.
 * Must be used after verifyToken / authenticate.
 */
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Forbidden: Admins only' });
  }
  next();
}

/**
 * requireKyc: Block if kycStatus !== APPROVED.
 * Must be used after verifyToken / authenticate.
 */
async function requireKyc(req, res, next) {
  try {
    const prisma = require('../utils/prisma');
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { kycStatus: true, status: true },
    });

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    if (user.status !== 'ACTIVE') {
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

/**
 * requireDealer: Block if role is neither DEALER nor ADMIN.
 * Must be used after verifyToken / authenticate.
 */
function requireDealer(req, res, next) {
  if (!req.user || (req.user.role !== 'DEALER' && req.user.role !== 'ADMIN')) {
    return res.status(403).json({ error: 'Forbidden: Dealers only' });
  }
  next();
}

/**
 * geofenceCheck: Block if the user's countryCode is in BLOCKED_COUNTRIES.
 * Reads from req.body.countryCode (register), req.user.countryCode (authenticated routes),
 * or IP-country headers as fallback.
 * Must be used after verifyToken when countryCode is expected from req.user.
 */
function geofenceCheck(req, res, next) {
  const blocked = getBlockedCountries();
  if (blocked.length === 0) return next();

  const countryCode = (
    req.body?.countryCode ||
    req.user?.countryCode ||
    req.headers['cf-ipcountry'] ||
    req.headers['x-country-code'] ||
    ''
  ).toUpperCase();

  if (countryCode && blocked.includes(countryCode)) {
    logger.warn('Geofence block', { countryCode, ip: req.ip, url: req.originalUrl });
    return res.status(451).json({
      error: 'Service unavailable in your region due to regulatory requirements.',
    });
  }

  next();
}

module.exports = { verifyToken, authenticate, requireAdmin, requireKyc, requireDealer, geofenceCheck };
