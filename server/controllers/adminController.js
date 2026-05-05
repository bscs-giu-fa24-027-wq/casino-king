'use strict';

const prisma = require('../utils/prisma');

/**
 * GET /api/admin/users
 */
async function listUsers(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const skip = (page - 1) * limit;

    const [total, users] = await Promise.all([
      prisma.user.count(),
      prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          email: true,
          username: true,
          role: true,
          kycStatus: true,
          isActive: true,
          createdAt: true,
        },
      }),
    ]);

    res.json({ total, page, limit, users });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/admin/users/:id/kyc
 * Body: { status: 'APPROVED' | 'REJECTED' }
 */
async function updateKyc(req, res, next) {
  try {
    const { status } = req.body;
    if (!['APPROVED', 'REJECTED'].includes(status)) {
      return res.status(400).json({ error: 'status must be APPROVED or REJECTED' });
    }

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { kycStatus: status },
      select: { id: true, email: true, kycStatus: true },
    });

    res.json(user);
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/admin/users/:id/suspend
 */
async function suspendUser(req, res, next) {
  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { isActive: false },
      select: { id: true, email: true, isActive: true },
    });
    res.json(user);
  } catch (err) {
    next(err);
  }
}

module.exports = { listUsers, updateKyc, suspendUser };
