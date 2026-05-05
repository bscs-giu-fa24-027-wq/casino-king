'use strict';

const jwt = require('jsonwebtoken');

/**
 * Signs a JWT for the given user.
 * @param {{ id: string, email: string, role: string }} user
 * @returns {string} signed JWT
 */
function signToken(user) {
  const payload = { id: user.id, email: user.email, role: user.role };
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

/**
 * Verifies a JWT and returns its decoded payload.
 * Throws JsonWebTokenError on failure.
 * @param {string} token
 * @returns {object} decoded payload
 */
function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

module.exports = { signToken, verifyToken };
