'use strict';

const { Prisma } = require('@prisma/client');
const prisma = require('../utils/prisma');
const { createNotification } = require('../services/notificationService');
const { createDealerBulkCheckout } = require('../services/paymentService');

const ADMIN_DEALER_STATUS_MAP = {
  // API accepts APPROVED as an action label; persisted dealer status is ACTIVE.
  // SUSPENDED/BANNED map directly because API and DB status names are the same.
  APPROVED: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  BANNED: 'BANNED',
};
// Use runtime ISO list when available; otherwise fallback keeps 2-letter format validation.
const ISO_COUNTRY_CODES = typeof Intl.supportedValuesOf === 'function'
  ? new Set(Intl.supportedValuesOf('region'))
  : null;

function formatYearMonth(date) {
  return date.toISOString().slice(0, 7);
}

async function applyDealer(req, res, next) {
  try {
    if (req.user.role !== 'PLAYER') {
      return res.status(403).json({ error: 'Only PLAYER accounts can apply as dealers' });
    }

    const { companyName, businessRegNumber, country } = req.body;
    if (!companyName || !businessRegNumber || !country) {
      return res.status(400).json({ error: 'companyName, businessRegNumber, and country are required' });
    }
    const normalizedCountry = country.toUpperCase();
    if (
      !/^[A-Za-z]{2}$/.test(normalizedCountry) ||
      (ISO_COUNTRY_CODES && !ISO_COUNTRY_CODES.has(normalizedCountry))
    ) {
      return res.status(400).json({ error: 'country must be a 2-letter ISO country code' });
    }

    const existing = await prisma.dealer.findUnique({ where: { userId: req.user.id } });
    if (existing) {
      return res.status(409).json({ error: 'Dealer application already exists for this user' });
    }

    const dealer = await prisma.dealer.create({
      data: {
        userId: req.user.id,
        companyName,
        businessRegNumber,
        country: normalizedCountry,
        status: 'PENDING',
      },
    });

    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN', status: 'ACTIVE' },
      select: { id: true },
    });

    await Promise.allSettled(
      admins.map((admin) =>
        createNotification(admin.id, {
          title: 'New dealer application',
          message: `${companyName} submitted a dealer application and is awaiting review.`,
          type: 'SYSTEM',
        })
      )
    );

    res.status(201).json({ dealer });
  } catch (err) {
    next(err);
  }
}

async function getDealerOrFail(userId) {
  const dealer = await prisma.dealer.findUnique({
    where: { userId },
    select: { id: true, userId: true, companyName: true, commissionPct: true, status: true },
  });

  if (!dealer) {
    const err = new Error('Dealer profile not found');
    err.status = 404;
    throw err;
  }

  if (dealer.status !== 'ACTIVE') {
    const err = new Error('Dealer account is not active');
    err.status = 403;
    throw err;
  }

  return dealer;
}

async function getDealerDashboard(req, res, next) {
  try {
    const dealer = await getDealerOrFail(req.user.id);

    const referrals = await prisma.referral.findMany({
      where: { referrerId: dealer.userId },
      select: { referredId: true },
    });

    const referredIds = referrals.map((r) => r.referredId);

    const revenueAggregate = referredIds.length > 0
      ? await prisma.transaction.aggregate({
          where: {
            userId: { in: referredIds },
            type: 'PURCHASE',
            status: 'COMPLETED',
          },
          _sum: { usdAmount: true },
        })
      : { _sum: { usdAmount: new Prisma.Decimal(0) } };

    const totalRevenue = revenueAggregate._sum.usdAmount || new Prisma.Decimal(0);
    const commissionEarned = totalRevenue
      .mul(new Prisma.Decimal(dealer.commissionPct))
      .div(new Prisma.Decimal(100));

    const recentTransactions = referredIds.length > 0
      ? await prisma.transaction.findMany({
          where: {
            userId: { in: referredIds },
            type: 'PURCHASE',
            status: 'COMPLETED',
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            userId: true,
            usdAmount: true,
            ckcAmount: true,
            createdAt: true,
            reference: true,
          },
        })
      : [];

    res.json({
      totalPlayersReferred: referrals.length,
      totalRevenue,
      commissionEarned,
      recentTransactions,
    });
  } catch (err) {
    next(err);
  }
}

async function getDealerPlayers(req, res, next) {
  try {
    const dealer = await getDealerOrFail(req.user.id);

    const referrals = await prisma.referral.findMany({
      where: { referrerId: dealer.userId },
      select: {
        referredId: true,
        createdAt: true,
        referred: {
          select: {
            id: true,
            email: true,
            fullName: true,
            wallet: { select: { lifetimeDeposited: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const referredIds = referrals.map((item) => item.referredId);

    const wagerAggregates = referredIds.length > 0
      ? await prisma.gameRound.groupBy({
          by: ['userId'],
          where: { userId: { in: referredIds } },
          _sum: { stakeCkc: true, payoutCkc: true },
          _count: { _all: true },
        })
      : [];

    const wagerByUserId = new Map(wagerAggregates.map((item) => [item.userId, item]));

    const players = referrals.map((entry) => {
      const wager = wagerByUserId.get(entry.referredId);
      return {
        player: entry.referred,
        referredAt: entry.createdAt,
        lifetimeDeposit: entry.referred.wallet?.lifetimeDeposited || new Prisma.Decimal(0),
        wagerStats: {
          roundsPlayed: wager?._count._all || 0,
          totalWagered: wager?._sum.stakeCkc || new Prisma.Decimal(0),
          totalPayout: wager?._sum.payoutCkc || new Prisma.Decimal(0),
        },
      };
    });

    res.json({ players });
  } catch (err) {
    next(err);
  }
}

async function createDealerBulkPurchase(req, res, next) {
  try {
    const dealer = await getDealerOrFail(req.user.id);
    const { usdAmount } = req.body;
    if (!usdAmount) {
      return res.status(400).json({ error: 'usdAmount is required' });
    }

    const result = await createDealerBulkCheckout(dealer.userId, usdAmount);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

async function getDealerRevenue(req, res, next) {
  try {
    const dealer = await getDealerOrFail(req.user.id);
    const commissionPct = new Prisma.Decimal(dealer.commissionPct);

    const referrals = await prisma.referral.findMany({
      where: { referrerId: dealer.userId },
      select: { referredId: true },
    });
    const referredIds = referrals.map((r) => r.referredId);

    const referredPurchases = referredIds.length > 0
      ? await prisma.transaction.findMany({
          where: {
            userId: { in: referredIds },
            type: 'PURCHASE',
            status: 'COMPLETED',
          },
          select: { createdAt: true, usdAmount: true },
        })
      : [];

    const monthlyMap = new Map();
    for (const tx of referredPurchases) {
      const key = formatYearMonth(tx.createdAt);
      const prev = monthlyMap.get(key) || new Prisma.Decimal(0);
      monthlyMap.set(key, prev.add(tx.usdAmount || new Prisma.Decimal(0)));
    }

    const monthlyRevenue = Array.from(monthlyMap.entries())
      .map(([month, revenue]) => ({
        month,
        revenueUsd: revenue,
        commissionUsd: revenue.mul(commissionPct).div(new Prisma.Decimal(100)),
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    const commissionPayments = await prisma.transaction.findMany({
      where: {
        userId: dealer.userId,
        type: 'BONUS',
        status: 'COMPLETED',
        reference: { startsWith: 'DEALER_COMMISSION:' },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        ckcAmount: true,
        reference: true,
        createdAt: true,
      },
    });

    res.json({ monthlyRevenue, commissionPayments });
  } catch (err) {
    next(err);
  }
}

async function updateDealerStatus(req, res, next) {
  try {
    const requestedStatus = typeof req.body.status === 'string'
      ? req.body.status.trim().toUpperCase()
      : '';
    const targetStatus = ADMIN_DEALER_STATUS_MAP[requestedStatus];
    if (!targetStatus) {
      return res.status(400).json({ error: 'status must be one of APPROVED, SUSPENDED, BANNED' });
    }

    const dealerId = req.params.id;

    const dealer = await prisma.dealer.findUnique({ where: { id: dealerId } });
    if (!dealer) {
      return res.status(404).json({ error: 'Dealer not found' });
    }

    const data = await prisma.$transaction(async (tx) => {
      const updatedDealer = await tx.dealer.update({
        where: { id: dealerId },
        data: { status: targetStatus },
      });

      const userUpdates = {};
      if (targetStatus === 'ACTIVE') {
        userUpdates.role = 'DEALER';
        userUpdates.status = 'ACTIVE';
      } else if (targetStatus === 'SUSPENDED') {
        userUpdates.status = 'SUSPENDED';
      } else if (targetStatus === 'BANNED') {
        userUpdates.status = 'BANNED';
      }

      if (Object.keys(userUpdates).length > 0) {
        await tx.user.update({
          where: { id: updatedDealer.userId },
          data: userUpdates,
        });
      }

      return updatedDealer;
    });

    const notifMessageByStatus = {
      ACTIVE: 'Your dealer account has been approved and activated.',
      SUSPENDED: 'Your dealer account has been suspended by admin.',
      BANNED: 'Your dealer account has been banned by admin.',
    };

    await createNotification(data.userId, {
      title: 'Dealer account status updated',
      message: notifMessageByStatus[data.status] || 'Your dealer account status has changed.',
      type: 'SYSTEM',
    });

    res.json({ dealer: data });
  } catch (err) {
    next(err);
  }
}

async function listDealers(req, res, next) {
  try {
    const dealers = await prisma.dealer.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            status: true,
            role: true,
          },
        },
      },
    });

    const dealerUserIds = dealers.map((dealer) => dealer.userId);
    const referrals = dealerUserIds.length > 0
      ? await prisma.referral.findMany({
          where: { referrerId: { in: dealerUserIds } },
          select: { referrerId: true, referredId: true },
        })
      : [];

    const referredIdsByDealer = new Map();
    for (const referral of referrals) {
      const current = referredIdsByDealer.get(referral.referrerId) || [];
      current.push(referral.referredId);
      referredIdsByDealer.set(referral.referrerId, current);
    }

    const allReferredIds = Array.from(new Set(referrals.map((item) => item.referredId)));
    const purchaseByUser = allReferredIds.length > 0
      ? await prisma.transaction.groupBy({
          by: ['userId'],
          where: {
            userId: { in: allReferredIds },
            type: 'PURCHASE',
            status: 'COMPLETED',
          },
          _sum: { usdAmount: true },
        })
      : [];
    const revenueByUserId = new Map(
      purchaseByUser.map((item) => [item.userId, item._sum.usdAmount || new Prisma.Decimal(0)])
    );

    const withStats = dealers.map((dealer) => {
      const referredIds = referredIdsByDealer.get(dealer.userId) || [];
      const referredRevenue = referredIds.reduce(
        (sum, referredId) => sum.add(revenueByUserId.get(referredId) || new Prisma.Decimal(0)),
        new Prisma.Decimal(0)
      );
      const commissionEarned = referredRevenue
        .mul(new Prisma.Decimal(dealer.commissionPct))
        .div(new Prisma.Decimal(100));

      return {
        ...dealer,
        stats: {
          totalPlayersReferred: referredIds.length,
          referredRevenue,
          commissionEarned,
        },
      };
    });

    res.json({ dealers: withStats });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  applyDealer,
  getDealerDashboard,
  getDealerPlayers,
  createDealerBulkPurchase,
  getDealerRevenue,
  updateDealerStatus,
  listDealers,
};
