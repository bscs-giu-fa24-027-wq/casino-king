'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const logger = require('./utils/logger');

// ─── Route Imports ────────────────────────────────────────────────────────────
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const walletRoutes = require('./routes/wallet');
const gameRoutes = require('./routes/game');
const paymentRoutes = require('./routes/payment');
const bonusRoutes = require('./routes/bonus');
const referralRoutes = require('./routes/referral');
const adminRoutes = require('./routes/admin');
const kycRoutes = require('./routes/kyc');
const missionRoutes = require('./routes/missions');
const leaderboardRoutes = require('./routes/leaderboard');

// ─── Middleware Imports ───────────────────────────────────────────────────────
const errorHandler = require('./middleware/errorHandler');
const geofence = require('./middleware/geofence');

const app = express();
const PORT = process.env.PORT || 4000;

// ─── Security Headers ────────────────────────────────────────────────────────
app.use(helmet());

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  })
);

// ─── Body Parsers ─────────────────────────────────────────────────────────────
// Stripe webhook needs the raw body for signature verification.
// Register express.raw() for that path before the global express.json() so the
// Buffer is preserved; the route handler re-applies express.raw() as a guard.
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Global Rate Limit ───────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use(globalLimiter);

// ─── Stricter limiter for auth endpoints ─────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth attempts, please try again later.' },
});

// ─── Geo-fencing (blocks restricted countries) ───────────────────────────────
app.use(geofence);

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/games', gameRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/bonuses', bonusRoutes);
app.use('/api/referrals', referralRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/kyc', kycRoutes);
app.use('/api/missions', missionRoutes);
app.use('/api/leaderboard', leaderboardRoutes);

// ─── 404 Handler ──────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Start Server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  logger.info(`Casino King server running on port ${PORT}`, { env: process.env.NODE_ENV || 'development' });
});

// ─── Leaderboard Cron Jobs ────────────────────────────────────────────────────
const cron = require('node-cron');
const {
  calculateRanks,
  awardLeaderboardPrizes,
  getWeekBounds,
  getMonthBounds,
} = require('./services/leaderboardService');

// Recalculate ranks every hour for both periods.
cron.schedule('0 * * * *', async () => {
  try {
    await calculateRanks('WEEKLY');
    await calculateRanks('MONTHLY');
    logger.info('Leaderboard ranks updated by hourly cron');
  } catch (err) {
    logger.error('Hourly leaderboard cron failed', { error: err.message });
  }
});

// Check every minute whether the current week period has ended and prizes need awarding.
// awardLeaderboardPrizes is idempotent (prizePaidAt guards double-award).
cron.schedule('* * * * *', async () => {
  try {
    const now = new Date();
    const weekBounds = getWeekBounds();
    const monthBounds = getMonthBounds();

    // Award weekly prizes the minute after the period ends (end < now).
    if (weekBounds.end < now) {
      await awardLeaderboardPrizes('WEEKLY', weekBounds);
    }

    if (monthBounds.end < now) {
      await awardLeaderboardPrizes('MONTHLY', monthBounds);
    }
  } catch (err) {
    logger.error('Period-end prize cron failed', { error: err.message });
  }
});

module.exports = app;
