'use strict';

const router = require('express').Router();
const prisma = require('../utils/prisma');
const { verifyToken } = require('../middleware/auth');
const { resolveCountryCode, isCountryBlocked } = require('../middleware/geofence');

const REQUIRED_TERMS_VERSION = '1.0';

router.get('/check', (req, res) => {
  const country = resolveCountryCode(req);
  const blocked = isCountryBlocked(country);

  return res.json({
    allowed: !blocked,
    country: country || null,
    reason: blocked ? 'BLOCKED_COUNTRY' : 'ALLOWED',
  });
});

router.post('/accept-terms', verifyToken, async (req, res, next) => {
  try {
    const { version } = req.body || {};
    if (version !== REQUIRED_TERMS_VERSION) {
      return res.status(400).json({ error: `version must be '${REQUIRED_TERMS_VERSION}'` });
    }

    const acceptedAt = new Date();
    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        termsAcceptedVersion: version,
        termsAcceptedAt: acceptedAt,
      },
    });

    return res.json({
      accepted: true,
      version,
      acceptedAt: acceptedAt.toISOString(),
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
