'use strict';

/**
 * Prisma seed script.
 * Run with: npm run seed  (inside /server)
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱  Seeding database...');

  // Admin user
  const adminHash = await bcrypt.hash('Admin1234!', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@casinoking.com' },
    update: {},
    create: {
      email: 'admin@casinoking.com',
      username: 'admin',
      passwordHash: adminHash,
      role: 'ADMIN',
      kycStatus: 'APPROVED',
      isActive: true,
    },
  });
  console.log(`  ✔ Admin user: ${admin.email}`);

  // Demo player
  const playerHash = await bcrypt.hash('Player1234!', 12);
  const player = await prisma.user.upsert({
    where: { email: 'player@casinoking.com' },
    update: {},
    create: {
      email: 'player@casinoking.com',
      username: 'demo_player',
      passwordHash: playerHash,
      role: 'PLAYER',
      kycStatus: 'APPROVED',
      isActive: true,
      wallet: { create: { balance: 100 } },
    },
  });
  console.log(`  ✔ Demo player: ${player.email} (balance: $100)`);

  // Sample bonus codes
  const bonuses = [
    { code: 'WELCOME50', type: 'WELCOME', value: 50, maxUses: 1000 },
    { code: 'DEPOSIT100', type: 'DEPOSIT', value: 100, maxUses: 500 },
  ];

  for (const b of bonuses) {
    await prisma.bonus.upsert({
      where: { code: b.code },
      update: {},
      create: b,
    });
    console.log(`  ✔ Bonus code: ${b.code}`);
  }

  console.log('✅  Seeding complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
