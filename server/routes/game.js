'use strict';

const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const requireKyc = require('../middleware/kycCheck');
const {
  listGames,
  playSlotGame,
  playRouletteGame,
  playBlackjackGame,
  getHistory,
} = require('../controllers/gameController');

router.get('/', listGames);
router.get('/history', authenticate, getHistory);

// KYC required for placing bets
router.post('/slots', authenticate, requireKyc, playSlotGame);
router.post('/roulette', authenticate, requireKyc, playRouletteGame);
router.post('/blackjack', authenticate, requireKyc, playBlackjackGame);

module.exports = router;
