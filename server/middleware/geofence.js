'use strict';

const logger = require('../utils/logger');

// Parse blocked countries from env (comma-separated ISO-3166-1 alpha-2 codes)
const BLOCKED_COUNTRIES = (process.env.BLOCKED_COUNTRIES || '')
  .split(',')
  .map((c) => c.trim().toUpperCase())
  .filter(Boolean);

/**
 * Geofencing middleware.
 * Reads the `CF-IPCountry` header (set by Cloudflare) or the
 * `X-Country-Code` header (for internal/proxy use) to determine
 * the request's origin country and block restricted jurisdictions.
 */
function geofence(req, res, next) {
  if (BLOCKED_COUNTRIES.length === 0) return next();

  // Prefer Cloudflare header, fall back to custom proxy header
  const country = (req.headers['cf-ipcountry'] || req.headers['x-country-code'] || '').toUpperCase();

  if (country && BLOCKED_COUNTRIES.includes(country)) {
    logger.warn('Geofence block', { country, ip: req.ip, url: req.originalUrl });
    return res.status(451).json({
      error: 'Service unavailable in your region due to regulatory requirements.',
    });
  }

  next();
}

module.exports = geofence;
