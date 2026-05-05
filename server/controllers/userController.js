'use strict';

const prisma = require('../utils/prisma');

/**
 * GET /api/users/me
 */
async function getMe(req, res, next) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        kycStatus: true,
        country: true,
        isActive: true,
        createdAt: true,
        wallet: { select: { balance: true, ckcTokens: true } },
      },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/users/me
 */
async function updateMe(req, res, next) {
  try {
    const { username, country } = req.body;
    const data = {};
    if (username) data.username = username;
    if (country) data.country = country;

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data,
      select: { id: true, email: true, username: true, country: true, role: true },
    });
    res.json(user);
  } catch (err) {
    next(err);
  }
}

module.exports = { getMe, updateMe };
