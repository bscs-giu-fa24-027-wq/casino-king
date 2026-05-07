'use strict';

const prisma = require('../utils/prisma');
const logger = require('../utils/logger');
const { createNotification } = require('../services/notificationService');
const { checkAge } = require('../middleware/geofence');

/**
 * POST /api/kyc/submit
 * Requires JWT auth.
 * Body: { documentType, documentNumber, dateOfBirth, nationality, documentImageBase64 }
 */
async function submitKyc(req, res, next) {
  try {
    const { documentType, documentNumber, dateOfBirth, nationality, documentImageBase64 } = req.body;

    if (!documentType || !documentNumber || !dateOfBirth || !nationality) {
      return res.status(400).json({
        error: 'documentType, documentNumber, dateOfBirth, and nationality are required',
      });
    }

    if (!checkAge(dateOfBirth)) {
      return res.status(400).json({ error: 'You must be at least 18 years old to submit KYC' });
    }

    // If a document image is provided, enforce a reasonable size limit (~5 MB as base64).
    if (documentImageBase64 !== undefined) {
      if (typeof documentImageBase64 !== 'string') {
        return res.status(400).json({ error: 'documentImageBase64 must be a base64-encoded string' });
      }
      // Base64 encodes ~3 bytes per 4 chars; 7,000,000 chars ≈ 5 MB decoded.
      if (documentImageBase64.length > 7_000_000) {
        return res.status(413).json({ error: 'Document image exceeds the 5 MB size limit' });
      }
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, fullName: true, kycStatus: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.kycStatus === 'APPROVED') {
      return res.status(409).json({ error: 'KYC is already approved' });
    }

    const now = new Date();
    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        kycStatus: 'SUBMITTED',
        kycSubmittedAt: now,
      },
    });

    logger.info('KYC submitted', { userId: req.user.id });

    if (process.env.NODE_ENV === 'production') {
      // Stub integration point for Jumio/Onfido.
      // In production, trigger an external KYC verification request here, e.g.:
      //   await jumioService.createVerification({ userId: req.user.id, documentType, documentNumber, ... });
      logger.info('KYC production provider integration (stub)', { userId: req.user.id });
    } else {
      // Development: auto-approve after 3 seconds to simulate provider callback.
      const userId = req.user.id;
      const fullName = user.fullName;
      setTimeout(async () => {
        try {
          await prisma.user.update({
            where: { id: userId },
            data: {
              kycStatus: 'APPROVED',
              kycReviewedAt: new Date(),
            },
          });

          await createNotification(userId, {
            title: 'KYC Approved',
            message: `Hi ${fullName}, your identity verification has been approved. You now have full access to all features.`,
            type: 'KYC',
          });

          logger.info('KYC auto-approved (development simulation)', { userId });
        } catch (err) {
          logger.error('KYC auto-approval simulation failed', { userId, error: err.message });
        }
      }, 3000);
    }

    return res.json({ status: 'submitted' });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/kyc/status
 * Requires JWT auth.
 */
async function getKycStatus(req, res, next) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { kycStatus: true, kycSubmittedAt: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({ kycStatus: user.kycStatus, submittedAt: user.kycSubmittedAt });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/kyc/:userId/review
 * Requires JWT auth + requireAdmin.
 * Body: { decision: 'APPROVED' | 'REJECTED', reason }
 */
async function reviewKyc(req, res, next) {
  try {
    const { userId } = req.params;
    const { decision, reason } = req.body;

    if (!decision || !['APPROVED', 'REJECTED'].includes(decision)) {
      return res.status(400).json({ error: 'decision must be APPROVED or REJECTED' });
    }

    if (decision === 'REJECTED' && !reason) {
      return res.status(400).json({ error: 'reason is required when decision is REJECTED' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, fullName: true, kycStatus: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const now = new Date();
    const updateData = {
      kycStatus: decision,
      kycReviewedAt: now,
    };

    if (decision === 'REJECTED') {
      updateData.kycRejectionReason = reason;
    }

    await prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    const notificationMessage =
      decision === 'APPROVED'
        ? `Hi ${user.fullName}, your identity verification has been approved. You now have full access to all features.`
        : `Hi ${user.fullName}, your identity verification has been rejected. Reason: ${reason}`;

    await createNotification(userId, {
      title: decision === 'APPROVED' ? 'KYC Approved' : 'KYC Rejected',
      message: notificationMessage,
      type: 'KYC',
    });

    logger.info('KYC reviewed', { userId, decision, adminId: req.user.id });

    return res.json({ userId, kycStatus: decision, reviewedAt: now });
  } catch (err) {
    next(err);
  }
}

module.exports = { submitKyc, getKycStatus, reviewKyc };
