// prisma/seed.js
// Seeds: TokenPackages, VipTiers, Games, Missions

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱  Starting seed...');

  // ── Token Packages ───────────────────────────────────────────────────────────
  const tokenPackages = [
    { name: 'Starter',  usdPrice: 5,   baseCkc: 50,   bonusCkc: 0,   isActive: true },
    { name: 'Bronze',   usdPrice: 10,  baseCkc: 100,  bonusCkc: 5,   isActive: true },
    { name: 'Silver',   usdPrice: 25,  baseCkc: 250,  bonusCkc: 25,  isActive: true },
    { name: 'Gold',     usdPrice: 50,  baseCkc: 500,  bonusCkc: 75,  isActive: true },
    { name: 'Diamond',  usdPrice: 100, baseCkc: 1000, bonusCkc: 200, isActive: true },
  ];

  await prisma.tokenPackage.deleteMany();
  await prisma.tokenPackage.createMany({ data: tokenPackages });
  console.log(`  ✔  Seeded ${tokenPackages.length} TokenPackages`);

  // ── VIP Tiers ────────────────────────────────────────────────────────────────
  const vipTiers = [
    {
      name: 'Bronze',
      minWager: 0,
      bonusPct: 5,
      badgeColor: '#CD7F32',
      perks: { weeklyBonus: 0, withdrawalPriority: 'normal', supportLevel: 'standard' },
    },
    {
      name: 'Silver',
      minWager: 10000,
      bonusPct: 10,
      badgeColor: '#C0C0C0',
      perks: { weeklyBonus: 50, withdrawalPriority: 'normal', supportLevel: 'priority' },
    },
    {
      name: 'Gold',
      minWager: 50000,
      bonusPct: 15,
      badgeColor: '#FFD700',
      perks: { weeklyBonus: 150, withdrawalPriority: 'fast', supportLevel: 'priority', birthdayBonus: 200 },
    },
    {
      name: 'Platinum',
      minWager: 200000,
      bonusPct: 20,
      badgeColor: '#E5E4E2',
      perks: { weeklyBonus: 500, withdrawalPriority: 'instant', supportLevel: 'vip', birthdayBonus: 500, personalAccountManager: true },
    },
    {
      name: 'Diamond',
      minWager: 500000,
      bonusPct: 30,
      badgeColor: '#B9F2FF',
      perks: { weeklyBonus: 1500, withdrawalPriority: 'instant', supportLevel: 'elite', birthdayBonus: 1000, personalAccountManager: true, exclusiveEvents: true },
    },
  ];

  await prisma.vipTier.deleteMany();
  await prisma.vipTier.createMany({ data: vipTiers });
  console.log(`  ✔  Seeded ${vipTiers.length} VipTiers`);

  // ── Games ─────────────────────────────────────────────────────────────────────
  const games = [
    { name: 'Texas Hold\'em Poker', category: 'POKER',     minStake: 10, maxStake: 500, isActive: true },
    { name: 'Classic Baccarat',     category: 'BACCARAT',  minStake: 20, maxStake: 500, isActive: true },
    { name: 'Blackjack 21',         category: 'BLACKJACK', minStake: 10, maxStake: 300, isActive: true },
    { name: 'European Roulette',    category: 'ROULETTE',  minStake: 5,  maxStake: 250, isActive: true },
    { name: 'Crash Rocket',         category: 'CRASH',     minStake: 5,  maxStake: 200, isActive: true },
    { name: 'Lucky Slots',          category: 'SLOTS',     minStake: 1,  maxStake: 100, isActive: true },
    { name: 'High-Low Dice',        category: 'DICE',      minStake: 1,  maxStake: 50,  isActive: true },
    { name: 'Weekly Lotto',         category: 'LOTTO',     minStake: 5,  maxStake: 5,   isActive: true },
  ];

  await prisma.game.deleteMany();
  await prisma.game.createMany({ data: games });
  console.log(`  ✔  Seeded ${games.length} Games`);

  // ── Missions ──────────────────────────────────────────────────────────────────
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(23, 59, 59, 999);

  const seasonEnd = new Date(now);
  seasonEnd.setDate(seasonEnd.getDate() + 30);

  const missions = [
    // DAILY — 3
    {
      title: 'First Spin',
      description: 'Play 1 Slots round today.',
      type: 'DAILY',
      targetValue: 1,
      rewardCkc: 10,
      isActive: true,
      expiresAt: tomorrow,
    },
    {
      title: 'Lucky Five',
      description: 'Win 5 game rounds in a single day.',
      type: 'DAILY',
      targetValue: 5,
      rewardCkc: 25,
      isActive: true,
      expiresAt: tomorrow,
    },
    {
      title: 'High Roller Daily',
      description: 'Wager at least 100 CKC in one day.',
      type: 'DAILY',
      targetValue: 100,
      rewardCkc: 50,
      isActive: true,
      expiresAt: tomorrow,
    },
    // SEASONAL — 2
    {
      title: 'Season Warrior',
      description: 'Complete 50 game rounds this season.',
      type: 'SEASONAL',
      targetValue: 50,
      rewardCkc: 200,
      isActive: true,
      expiresAt: seasonEnd,
    },
    {
      title: 'Big Spender',
      description: 'Wager a total of 5000 CKC this season.',
      type: 'SEASONAL',
      targetValue: 5000,
      rewardCkc: 500,
      isActive: true,
      expiresAt: seasonEnd,
    },
  ];

  await prisma.mission.deleteMany();
  await prisma.mission.createMany({ data: missions });
  console.log(`  ✔  Seeded ${missions.length} Missions`);

  console.log('✅  Seed complete!');
}

main()
  .catch((err) => {
    console.error('❌  Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
