'use strict';

const router = require('express').Router();
const { verifyToken, requireKyc } = require('../middleware/auth');
const gameService = require('../services/gameService');

// GET /api/games — public, return all active games
router.get('/', async (req, res, next) => {
  try {
    const games = await gameService.getActiveGames();
    res.json(games);
  } catch (err) {
    next(err);
  }
});

// GET /api/games/history — requires JWT, paginated round history
// Must be defined before /:id to prevent Express matching "history" as an id param
router.get('/history', verifyToken, async (req, res, next) => {
  try {
    const { limit, offset } = req.query;
    const result = await gameService.getGameHistory(req.user.id, { limit, offset });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/games/:id — public, return game details
router.get('/:id', async (req, res, next) => {
  try {
    const game = await gameService.getGameById(req.params.id);
    res.json(game);
  } catch (err) {
    next(err);
  }
});

// POST /api/games/:id/play — requires JWT + KYC
router.post('/:id/play', verifyToken, requireKyc, async (req, res, next) => {
  try {
    const result = await gameService.playGame(req.user.id, req.params.id, req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
