'use strict';

const jwt = require('jsonwebtoken');
const prisma = require('../utils/prisma');

/**
 * Generates a short-lived access token and a long-lived refresh token.
 * @param {{ id: string, email: string, role: string }} user
 * @returns {{ accessToken: string, refreshToken: string }}
 */
function generateTokens(user) {
  const payload = { id: user.id, email: user.email, role: user.role };

  const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
  });

  const refreshToken = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  });

  return { accessToken, refreshToken };
}

/**
 * Persists a refresh token in the database.
 * @param {string} userId
 * @param {string} token
 * @returns {Promise<void>}
 */
async function saveRefreshToken(userId, token) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  await prisma.refreshToken.create({ data: { userId, token, expiresAt } });
}

/**
 * Validates a refresh token and returns the associated user.
 * Throws if invalid or expired.
 * @param {string} token
 * @returns {Promise<import('@prisma/client').User>}
 */
async function validateRefreshToken(token) {
  const record = await prisma.refreshToken.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!record || record.expiresAt < new Date()) {
    throw Object.assign(new Error('Invalid or expired refresh token'), { status: 401 });
  }

  return record.user;
}

/**
 * Revokes (deletes) a refresh token.
 * @param {string} token
 * @returns {Promise<void>}
 */
async function revokeRefreshToken(token) {
  await prisma.refreshToken.deleteMany({ where: { token } });
}

module.exports = { generateTokens, saveRefreshToken, validateRefreshToken, revokeRefreshToken };
