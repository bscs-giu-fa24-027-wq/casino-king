'use strict';

const geoip = require('geoip-lite');
const logger = require('../utils/logger');

const DEFAULT_BLOCKED_COUNTRIES = ['US', 'PK', 'IN', 'CN', 'TR', 'SA', 'IR', 'KP', 'SY', 'CU'];

function parseBlockedCountries(value) {
  return (value || '')
    .split(',')
    .map((country) => country.trim().toUpperCase())
    .filter(Boolean);
}

function getBlockedCountries() {
  const parsed = parseBlockedCountries(process.env.BLOCKED_COUNTRIES);
  return parsed.length > 0 ? parsed : DEFAULT_BLOCKED_COUNTRIES;
}

function normalizeCountryCode(value) {
  if (!value || typeof value !== 'string') return '';
  return value.trim().toUpperCase();
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = Array.isArray(forwarded) ? forwarded[0] : (forwarded || req.ip || req.socket?.remoteAddress || '');
  const first = String(ip).split(',')[0].trim();

  if (first.startsWith('::ffff:')) return first.slice(7);
  if (first === '::1') return '127.0.0.1';
  return first;
}

function lookupCountryFromIp(req) {
  const ip = getClientIp(req);
  if (!ip) return '';

  const result = geoip.lookup(ip);
  return normalizeCountryCode(result?.country);
}

function resolveCountryCode(req) {
  return (
    normalizeCountryCode(req.user?.countryCode) ||
    normalizeCountryCode(req.headers['x-country-code']) ||
    normalizeCountryCode(req.headers['cf-ipcountry']) ||
    lookupCountryFromIp(req)
  );
}

function isCountryBlocked(countryCode) {
  return !!countryCode && getBlockedCountries().includes(countryCode);
}

function checkAge(dateOfBirth) {
  const birthDate = new Date(dateOfBirth);
  if (Number.isNaN(birthDate.getTime())) return false;

  const now = new Date();
  let age = now.getFullYear() - birthDate.getFullYear();
  const monthDiff = now.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDate.getDate())) {
    age -= 1;
  }

  return age >= 18;
}

/**
 * Geofencing middleware for regulated routes.
 */
function checkGeofence(req, res, next) {
  const country = resolveCountryCode(req);
  if (isCountryBlocked(country)) {
    logger.warn('Geofence block', { country, ip: getClientIp(req), url: req.originalUrl });
    return res.status(403).json({
      error: 'SERVICE_UNAVAILABLE',
      message: 'Service not available in your region',
    });
  }

  return next();
}

module.exports = {
  getBlockedCountries,
  resolveCountryCode,
  isCountryBlocked,
  checkGeofence,
  checkAge,
};
