'use strict';

const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const prisma = require('../utils/prisma');

// All notification routes require JWT authentication
router.use(authenticate);

// ─── GET /api/notifications ───────────────────────────────────────────────────
// Return last 50 notifications for the authenticated user, unread first.
// Supports ?unreadOnly=true query param.
router.get('/', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const unreadOnly = req.query.unreadOnly === 'true';

    const where = { userId };
    if (unreadOnly) {
      where.isRead = false;
    }

    const notifications = await prisma.notification.findMany({
      where,
      orderBy: [
        { isRead: 'asc' },       // unread (false) sorts before read (true)
        { createdAt: 'desc' },   // newest first within each group
      ],
      take: 50,
    });

    return res.json({ notifications });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /api/notifications/read-all ───────────────────────────────────────
// Mark all authenticated user's notifications as read.
// Declared before /:id/read to avoid route conflict.
router.patch('/read-all', async (req, res, next) => {
  try {
    const userId = req.user.id;

    await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });

    return res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/notifications/unread-count ─────────────────────────────────────
// Return { count } of unread notifications for the authenticated user.
router.get('/unread-count', async (req, res, next) => {
  try {
    const userId = req.user.id;

    const count = await prisma.notification.count({
      where: { userId, isRead: false },
    });

    return res.json({ count });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /api/notifications/:id/read ───────────────────────────────────────
// Mark a single notification as read (owner check enforced).
router.patch('/:id/read', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const notification = await prisma.notification.findUnique({ where: { id } });

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    // Enforce ownership — only the owner may mark their notification as read
    if (notification.userId !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const updated = await prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });

    return res.json({ notification: updated });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
