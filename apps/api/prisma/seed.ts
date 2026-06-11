import { PrismaClient, StaffRole, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const addDays = (date: Date, days: number, hour: number, minute = 0) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  next.setHours(hour, minute, 0, 0);
  return next;
};

async function resetBranchScopedData() {
  await prisma.notificationLog.deleteMany();
  await prisma.notificationJob.deleteMany();
  await prisma.lessonDeduction.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.boxingClass.deleteMany();
  await prisma.lessonBalance.deleteMany();
  await prisma.staffBranchAssignment.deleteMany();
  await prisma.memberBranch.deleteMany();
  await prisma.branch.deleteMany();
  await prisma.gym.deleteMany();
}

async function main() {
  await resetBranchScopedData();

  const adminPasswordHash = await bcrypt.hash('admin123456', 10);
  const managerPasswordHash = await bcrypt.hash('manager123456', 10);

  const gym = await prisma.gym.create({
    data: { name: '拳馆约课' }
  });

  const eastBranch = await prisma.branch.create({
    data: {
      gymId: gym.id,
      name: '城东店',
      address: '城东训练中心',
      phone: '18810000001'
    }
  });

  const westBranch = await prisma.branch.create({
    data: {
      gymId: gym.id,
      name: '城西店',
      address: '城西训练中心',
      phone: '18810000002'
    }
  });

  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {
      displayName: '馆长',
      passwordHash: adminPasswordHash,
      role: UserRole.ADMIN,
      status: 'ACTIVE'
    },
    create: {
      username: 'admin',
      displayName: '馆长',
      passwordHash: adminPasswordHash,
      role: UserRole.ADMIN
    }
  });

  const eastManager = await prisma.user.upsert({
    where: { username: 'east-manager' },
    update: {
      displayName: '东店店长',
      passwordHash: managerPasswordHash,
      role: UserRole.ADMIN,
      status: 'ACTIVE'
    },
    create: {
      username: 'east-manager',
      displayName: '东店店长',
      passwordHash: managerPasswordHash,
      role: UserRole.ADMIN
    }
  });

  const coach = await prisma.user.upsert({
    where: { username: 'coach-leo' },
    update: {
      displayName: 'Coach Leo',
      role: UserRole.USER,
      status: 'ACTIVE'
    },
    create: {
      username: 'coach-leo',
      displayName: 'Coach Leo',
      role: UserRole.USER
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

  const now = new Date();

  await prisma.staffBranchAssignment.createMany({
    data: [
      {
        gymId: gym.id,
        branchId: eastBranch.id,
        userId: admin.id,
        role: StaffRole.OWNER,
        startsAt: now
      },
      {
        gymId: gym.id,
        branchId: westBranch.id,
        userId: admin.id,
        role: StaffRole.OWNER,
        startsAt: now
      },
      {
        gymId: gym.id,
        branchId: eastBranch.id,
        userId: eastManager.id,
        role: StaffRole.MANAGER,
        startsAt: now
      },
      {
        gymId: gym.id,
        branchId: eastBranch.id,
        userId: coach.id,
        role: StaffRole.COACH,
        startsAt: addDays(now, -90, 0),
        endsAt: addDays(now, -1, 23, 59)
      },
      {
        gymId: gym.id,
        branchId: westBranch.id,
        userId: coach.id,
        role: StaffRole.COACH,
        startsAt: now
      }
    ]
  });

  await prisma.memberBranch.createMany({
    data: [
      {
        gymId: gym.id,
        branchId: eastBranch.id,
        userId: memberA.id,
        memberNo: 'E-001',
        isDefault: true
      },
      {
        gymId: gym.id,
        branchId: westBranch.id,
        userId: memberB.id,
        memberNo: 'W-001',
        isDefault: true
      }
    ]
  });

  await prisma.lessonBalance.createMany({
    data: [
      {
        gymId: gym.id,
        branchId: eastBranch.id,
        userId: memberA.id,
        remaining: 10
      },
      {
        gymId: gym.id,
        branchId: westBranch.id,
        userId: memberB.id,
        remaining: 6
      }
    ]
  });

  await prisma.boxingClass.createMany({
    data: [
      {
        gymId: gym.id,
        branchId: eastBranch.id,
        coachId: coach.id,
        coachNameSnapshot: 'Coach Leo',
        title: '基础拳击燃脂',
        startsAt: addDays(now, 1, 19, 30),
        durationMin: 60,
        capacity: 8,
        description: '适合新手和恢复训练，重点练习步伐、直拳和基础组合。'
      },
      {
        gymId: gym.id,
        branchId: westBranch.id,
        coachId: coach.id,
        coachNameSnapshot: 'Coach Leo',
        title: '进阶组合拳',
        startsAt: addDays(now, 2, 20, 0),
        durationMin: 75,
        capacity: 6,
        description: '强化组合拳、闪躲和节奏控制，适合有基础的会员。'
      },
      {
        gymId: gym.id,
        branchId: eastBranch.id,
        coachId: coach.id,
        coachNameSnapshot: 'Coach Leo',
        title: '周末实战体能',
        startsAt: addDays(now, 5, 10, 30),
        durationMin: 90,
        capacity: 10,
        description: '拳击体能、核心力量和轻实战演练，强度较高。'
      }
    ]
  });

  console.log(
    `Seeded ${gym.name}, branches ${eastBranch.name}/${westBranch.name}, admin ${admin.username}, and members ${memberA.displayName}/${memberB.displayName}.`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
