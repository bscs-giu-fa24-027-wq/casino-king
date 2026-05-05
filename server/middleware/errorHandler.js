'use strict';

const logger = require('../utils/logger');

/**
 * Global error-handling middleware.
 * Must be registered last (after all routes).
 *
 * @param {Error} err
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} _next
 */
function errorHandler(err, req, res, _next) {
  const status = err.status || err.statusCode || 500;
  const message = status < 500 ? err.message : 'Internal server error';

  logger.error('Unhandled error', {
    method: req.method,
    url: req.originalUrl,
    status,
    message: err.message,
    stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
  });

  res.status(status).json({ error: message });
}

module.exports = errorHandler;
