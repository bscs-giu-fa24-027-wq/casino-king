'use strict';

const prisma = require('../utils/prisma');
const logger = require('../utils/logger');
const tokenService = require('./tokenService');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayUTC() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function thisWeekStart() {
  const now = new Date();
  const day = now.getUTCDay();
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(now.getUTCDate() - day);
  return start;
}

// ─── Core Functions ───────────────────────────────────────────────────────────

/**
 * Returns all active missions with the user's current progress.
 * @param {string} userId
 * @returns {Promise<object[]>}
 */
async function getActiveMissions(userId) {
  const now = new Date();

  const missions = await prisma.mission.findMany({
    where: {
      isActive: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: { type: 'asc' },
  });

  if (missions.length === 0) return [];

  const missionIds = missions.map((m) => m.id);

  const userMissions = await prisma.userMission.findMany({
    where: { userId, missionId: { in: missionIds } },
  });

  const progressMap = {};
  for (const um of userMissions) {
    progressMap[um.missionId] = um;
  }

  return missions.map((m) => {
    const um = progressMap[m.id];
    return {
      ...m,
      userProgress: um
        ? { progress: um.progress, isCompleted: um.isCompleted, completedAt: um.completedAt }
        : { progress: 0, isCompleted: false, completedAt: null },
    };
  });
}

/**
 * Updates progress for a specific mission for a user.
 * If progress reaches targetValue: marks complete, awards rewardCkc, sends notification.
 * @param {string} userId
 * @param {string} missionId
 * @param {number} increment  - how much to add to progress (default 1)
 * @returns {Promise<object|null>} updated UserMission or null if mission not found/inactive
 */
async function updateMissionProgress(userId, missionId, increment = 1) {
  const now = new Date();

  const mission = await prisma.mission.findFirst({
    where: {
      id: missionId,
      isActive: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
  });

  if (!mission) return null;

  // Get or create UserMission
  let userMission = await prisma.userMission.findFirst({
    where: { userId, missionId },
  });

  if (!userMission) {
    userMission = await prisma.userMission.create({
      data: { userId, missionId, progress: 0 },
    });
  }

  // Already completed
  if (userMission.isCompleted) return userMission;

  const newProgress = userMission.progress + increment;
  const completed = newProgress >= mission.targetValue;

  userMission = await prisma.userMission.update({
    where: { id: userMission.id },
    data: {
      progress: newProgress,
      isCompleted: completed,
      completedAt: completed ? now : null,
    },
  });

  if (completed) {
    // Award CKC
    try {
      await tokenService.creditBonus(userId, mission.rewardCkc, 'BONUS');
    } catch (err) {
      logger.warn('Failed to award mission CKC', { userId, missionId, error: err.message });
    }

    // Send notification
    try {
      await prisma.notification.create({
        data: {
          userId,
          title: `Mission complete: ${mission.title}`,
          message: `You completed "${mission.title}" and earned ${mission.rewardCkc} CKC!`,
          type: 'BONUS',
        },
      });
    } catch (err) {
      logger.warn('Failed to send mission notification', { userId, missionId, error: err.message });
    }

    logger.info('Mission completed', { userId, missionId, title: mission.title, rewardCkc: mission.rewardCkc });
  }

  return userMission;
}

// ─── Mission Triggers ─────────────────────────────────────────────────────────

/**
 * Trigger: "Play 5 rounds today" — called after each game round.
 * Matches DAILY missions whose title contains 'round' or 'spin' or 'play'.
 * @param {string} userId
 */
async function triggerRoundsPlayed(userId) {
  const today = todayUTC();
  const missions = await prisma.mission.findMany({
    where: {
      isActive: true,
      type: 'DAILY',
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
  });

  for (const m of missions) {
    const desc = (m.title + ' ' + m.description).toLowerCase();
    if (desc.includes('round') || desc.includes('spin') || desc.includes('play')) {
      // Only count rounds played today for DAILY missions
      const roundsToday = await prisma.gameRound.count({
        where: { userId, playedAt: { gte: today } },
      });

      let um = await prisma.userMission.findFirst({ where: { userId, missionId: m.id } });
      if (!um) {
        um = await prisma.userMission.create({ data: { userId, missionId: m.id, progress: 0 } });
      }
      if (um.isCompleted) continue;

      const newProgress = roundsToday;
      const completed = newProgress >= m.targetValue;

      um = await prisma.userMission.update({
        where: { id: um.id },
        data: { progress: newProgress, isCompleted: completed, completedAt: completed ? new Date() : null },
      });

      if (completed) {
        try { await tokenService.creditBonus(userId, m.rewardCkc, 'BONUS'); } catch (_) { /* best-effort */ }
        try {
          await prisma.notification.create({
            data: {
              userId,
              title: `Mission complete: ${m.title}`,
              message: `You completed "${m.title}" and earned ${m.rewardCkc} CKC!`,
              type: 'BONUS',
            },
          });
        } catch (_) { /* best-effort */ }
        logger.info('Mission completed via triggerRoundsPlayed', { userId, missionId: m.id });
      }
    }
  }
}

/**
 * Trigger: "Wager 1000 CKC today" — called after each game stake.
 * Matches DAILY missions whose title/description contains 'wager'.
 * @param {string} userId
 * @param {number|import('@prisma/client').Prisma.Decimal} stakeCkc
 */
async function triggerWager(userId, stakeCkc) {
  const today = todayUTC();
  const missions = await prisma.mission.findMany({
    where: {
      isActive: true,
      type: { in: ['DAILY', 'SEASONAL'] },
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
  });

  for (const m of missions) {
    const desc = (m.title + ' ' + m.description).toLowerCase();
    if (!desc.includes('wager')) continue;

    let um = await prisma.userMission.findFirst({ where: { userId, missionId: m.id } });
    if (!um) {
      um = await prisma.userMission.create({ data: { userId, missionId: m.id, progress: 0 } });
    }
    if (um.isCompleted) continue;

    // For DAILY missions sum today's wagers; for SEASONAL use total stored progress
    let newProgress;
    if (m.type === 'DAILY') {
      const agg = await prisma.gameRound.aggregate({
        where: { userId, playedAt: { gte: today } },
        _sum: { stakeCkc: true },
      });
      newProgress = Math.floor(parseFloat(agg._sum.stakeCkc ?? 0));
    } else {
      newProgress = um.progress + Math.floor(parseFloat(stakeCkc));
    }

    const completed = newProgress >= m.targetValue;
    um = await prisma.userMission.update({
      where: { id: um.id },
      data: { progress: newProgress, isCompleted: completed, completedAt: completed ? new Date() : null },
    });

    if (completed) {
      try { await tokenService.creditBonus(userId, m.rewardCkc, 'BONUS'); } catch (_) { /* best-effort */ }
      try {
        await prisma.notification.create({
          data: {
            userId,
            title: `Mission complete: ${m.title}`,
            message: `You completed "${m.title}" and earned ${m.rewardCkc} CKC!`,
            type: 'BONUS',
          },
        });
      } catch (_) { /* best-effort */ }
      logger.info('Mission completed via triggerWager', { userId, missionId: m.id });
    }
  }
}

/**
 * Trigger: "Win 3 times in a row" — called after each game round.
 * Matches missions whose title/description contains 'row' or 'consecutive' or 'streak'.
 * Queries recent rounds to count consecutive wins.
 * @param {string} userId
 * @param {boolean} isWin - whether the most recent round was a win
 */
async function triggerWinStreak(userId, isWin) {
  const missions = await prisma.mission.findMany({
    where: {
      isActive: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
  });

  for (const m of missions) {
    const desc = (m.title + ' ' + m.description).toLowerCase();
    if (!desc.includes('row') && !desc.includes('consecutive') && !desc.includes('streak')) continue;

    let um = await prisma.userMission.findFirst({ where: { userId, missionId: m.id } });
    if (!um) {
      um = await prisma.userMission.create({ data: { userId, missionId: m.id, progress: 0 } });
    }
    if (um.isCompleted) continue;

    let newProgress;
    if (isWin) {
      newProgress = um.progress + 1;
    } else {
      newProgress = 0; // reset streak on loss
    }

    const completed = newProgress >= m.targetValue;
    um = await prisma.userMission.update({
      where: { id: um.id },
      data: { progress: newProgress, isCompleted: completed, completedAt: completed ? new Date() : null },
    });

    if (completed) {
      try { await tokenService.creditBonus(userId, m.rewardCkc, 'BONUS'); } catch (_) { /* best-effort */ }
      try {
        await prisma.notification.create({
          data: {
            userId,
            title: `Mission complete: ${m.title}`,
            message: `You completed "${m.title}" and earned ${m.rewardCkc} CKC!`,
            type: 'BONUS',
          },
        });
      } catch (_) { /* best-effort */ }
      logger.info('Mission completed via triggerWinStreak', { userId, missionId: m.id });
    }
  }
}

/**
 * Trigger: "Deposit this week" — called after a successful purchase.
 * Matches missions whose title/description contains 'deposit'.
 * @param {string} userId
 */
async function triggerDeposit(userId) {
  const weekStart = thisWeekStart();
  const missions = await prisma.mission.findMany({
    where: {
      isActive: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
  });

  for (const m of missions) {
    const desc = (m.title + ' ' + m.description).toLowerCase();
    if (!desc.includes('deposit')) continue;

    let um = await prisma.userMission.findFirst({ where: { userId, missionId: m.id } });
    if (!um) {
      um = await prisma.userMission.create({ data: { userId, missionId: m.id, progress: 0 } });
    }
    if (um.isCompleted) continue;

    // Count deposits this week
    const depositsThisWeek = await prisma.transaction.count({
      where: { userId, type: 'PURCHASE', status: 'COMPLETED', createdAt: { gte: weekStart } },
    });

    const newProgress = depositsThisWeek;
    const completed = newProgress >= m.targetValue;

    um = await prisma.userMission.update({
      where: { id: um.id },
      data: { progress: newProgress, isCompleted: completed, completedAt: completed ? new Date() : null },
    });

    if (completed) {
      try { await tokenService.creditBonus(userId, m.rewardCkc, 'BONUS'); } catch (_) { /* best-effort */ }
      try {
        await prisma.notification.create({
          data: {
            userId,
            title: `Mission complete: ${m.title}`,
            message: `You completed "${m.title}" and earned ${m.rewardCkc} CKC!`,
            type: 'BONUS',
          },
        });
      } catch (_) { /* best-effort */ }
      logger.info('Mission completed via triggerDeposit', { userId, missionId: m.id });
    }
  }
}

module.exports = {
  getActiveMissions,
  updateMissionProgress,
  triggerRoundsPlayed,
  triggerWager,
  triggerWinStreak,
  triggerDeposit,
};
