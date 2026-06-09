import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const addDays = (date: Date, days: number, hour: number, minute = 0) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  next.setHours(hour, minute, 0, 0);
  return next;
};

async function main() {
  const passwordHash = await bcrypt.hash('admin123456', 10);

  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {
      displayName: '馆长',
      passwordHash,
      role: UserRole.ADMIN,
      status: 'ACTIVE'
    },
    create: {
      username: 'admin',
      displayName: '馆长',
      passwordHash,
      role: UserRole.ADMIN
    }
  });

  const memberA = await prisma.user.upsert({
    where: { phone: '18800000001' },
    update: {
      displayName: '阿杰',
      role: UserRole.USER,
      status: 'ACTIVE'
    },
    create: {
      phone: '18800000001',
      displayName: '阿杰',
      role: UserRole.USER
    }
  });

  const memberB = await prisma.user.upsert({
    where: { phone: '18800000002' },
    update: {
      displayName: '小林',
      role: UserRole.USER,
      status: 'ACTIVE'
    },
    create: {
      phone: '18800000002',
      displayName: '小林',
      role: UserRole.USER
    }
  });

  await prisma.lessonBalance.upsert({
    where: { userId: memberA.id },
    update: { remaining: 10 },
    create: { userId: memberA.id, remaining: 10 }
  });

  await prisma.lessonBalance.upsert({
    where: { userId: memberB.id },
    update: { remaining: 6 },
    create: { userId: memberB.id, remaining: 6 }
  });

  await prisma.notificationLog.deleteMany();
  await prisma.notificationJob.deleteMany();
  await prisma.lessonDeduction.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.boxingClass.deleteMany();

  const now = new Date();
  await prisma.boxingClass.createMany({
    data: [
      {
        title: '基础拳击燃脂',
        coach: 'Coach Leo',
        startsAt: addDays(now, 1, 19, 30),
        durationMin: 60,
        capacity: 8,
        description: '适合新手和恢复训练，重点练习步伐、直拳和基础组合。'
      },
      {
        title: '进阶组合拳',
        coach: 'Coach Mina',
        startsAt: addDays(now, 2, 20, 0),
        durationMin: 75,
        capacity: 6,
        description: '强化组合拳、闪躲和节奏控制，适合有基础的会员。'
      },
      {
        title: '周末实战体能',
        coach: 'Coach Han',
        startsAt: addDays(now, 5, 10, 30),
        durationMin: 90,
        capacity: 10,
        description: '拳击体能、核心力量和轻实战演练，强度较高。'
      }
    ]
  });

  console.log(`Seeded admin ${admin.username}, members ${memberA.displayName}/${memberB.displayName}, and sample classes.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
