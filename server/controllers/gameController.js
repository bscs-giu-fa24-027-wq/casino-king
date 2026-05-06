'use strict';

const gameService = require('../services/gameService');

/**
 * GET /api/games
 */
async function listGames(req, res, next) {
  try {
    const games = await gameService.getActiveGames();
    res.json(games);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/games/history
 */
async function getHistory(req, res, next) {
  try {
    const { limit, offset } = req.query;
    const result = await gameService.getGameHistory(req.user.id, { limit, offset });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/games/:id/play
 */
async function playGameRound(req, res, next) {
  try {
    const result = await gameService.playGame(req.user.id, req.params.id, req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { listGames, getHistory, playGameRound };
