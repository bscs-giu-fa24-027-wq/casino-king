'use strict';

const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { generate, claim, stats, refer, listReferrals } = require('../controllers/referralController');

// ─── Authenticated routes ─────────────────────────────────────────────────────
router.post('/generate', authenticate, generate);
router.get('/stats', authenticate, stats);

// ─── Unauthenticated: called by register flow with ?ref= ─────────────────────
router.post('/claim', claim);

// ─── Legacy routes (backward compatibility) ──────────────────────────────────
router.use(authenticate);
router.get('/', listReferrals);
router.post('/', refer);

module.exports = router;
