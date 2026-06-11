-- CreateTable
CREATE TABLE `Gym` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `status` ENUM('ACTIVE', 'DISABLED') NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Gym_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Branch` (
    `id` VARCHAR(191) NOT NULL,
    `gymId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `address` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `status` ENUM('ACTIVE', 'DISABLED') NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Branch_gymId_idx`(`gymId`),
    INDEX `Branch_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MemberBranch` (
    `id` VARCHAR(191) NOT NULL,
    `gymId` VARCHAR(191) NOT NULL,
    `branchId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `memberNo` VARCHAR(191) NULL,
    `status` ENUM('ACTIVE', 'DISABLED') NOT NULL DEFAULT 'ACTIVE',
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `joinedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `MemberBranch_gymId_idx`(`gymId`),
    INDEX `MemberBranch_branchId_idx`(`branchId`),
    INDEX `MemberBranch_status_idx`(`status`),
    UNIQUE INDEX `MemberBranch_userId_branchId_key`(`userId`, `branchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StaffBranchAssignment` (
    `id` VARCHAR(191) NOT NULL,
    `gymId` VARCHAR(191) NOT NULL,
    `branchId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `role` ENUM('OWNER', 'MANAGER', 'COACH') NOT NULL,
    `startsAt` DATETIME(3) NOT NULL,
    `endsAt` DATETIME(3) NULL,
    `status` ENUM('ACTIVE', 'DISABLED') NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `StaffBranchAssignment_userId_role_idx`(`userId`, `role`),
    INDEX `StaffBranchAssignment_branchId_role_idx`(`branchId`, `role`),
    INDEX `StaffBranchAssignment_gymId_idx`(`gymId`),
    INDEX `StaffBranchAssignment_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Seed default gym and branches for existing single-branch data.
INSERT INTO `Gym` (`id`, `name`, `status`, `createdAt`, `updatedAt`)
VALUES ('gym_default', '拳馆约课', 'ACTIVE', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));

INSERT INTO `Branch` (`id`, `gymId`, `name`, `address`, `phone`, `status`, `createdAt`, `updatedAt`)
VALUES
  ('branch_east', 'gym_default', '城东店', '城东训练中心', '18810000001', 'ACTIVE', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  ('branch_west', 'gym_default', '城西店', '城西训练中心', '18810000002', 'ACTIVE', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));

-- Alter existing class data with nullable columns first so current rows can be backfilled.
ALTER TABLE `BoxingClass`
  ADD COLUMN `gymId` VARCHAR(191) NULL,
  ADD COLUMN `branchId` VARCHAR(191) NULL,
  ADD COLUMN `coachId` VARCHAR(191) NULL,
  ADD COLUMN `coachNameSnapshot` VARCHAR(191) NULL;

UPDATE `BoxingClass`
SET `gymId` = 'gym_default',
    `branchId` = 'branch_east',
    `coachNameSnapshot` = `coach`;

ALTER TABLE `BoxingClass`
  MODIFY `gymId` VARCHAR(191) NOT NULL,
  MODIFY `branchId` VARCHAR(191) NOT NULL,
  MODIFY `coachNameSnapshot` VARCHAR(191) NOT NULL,
  DROP COLUMN `coach`;

-- Alter booking data and backfill branch scope from the class.
ALTER TABLE `Booking`
  ADD COLUMN `gymId` VARCHAR(191) NULL,
  ADD COLUMN `branchId` VARCHAR(191) NULL;

UPDATE `Booking` AS `booking`
INNER JOIN `BoxingClass` AS `boxingClass` ON `booking`.`classId` = `boxingClass`.`id`
SET `booking`.`gymId` = `boxingClass`.`gymId`,
    `booking`.`branchId` = `boxingClass`.`branchId`;

ALTER TABLE `Booking`
  MODIFY `gymId` VARCHAR(191) NOT NULL,
  MODIFY `branchId` VARCHAR(191) NOT NULL;

-- Alter balances to become branch-scoped.
ALTER TABLE `LessonBalance`
  ADD COLUMN `gymId` VARCHAR(191) NULL,
  ADD COLUMN `branchId` VARCHAR(191) NULL;

UPDATE `LessonBalance`
SET `gymId` = 'gym_default',
    `branchId` = 'branch_east';

ALTER TABLE `LessonBalance`
  MODIFY `gymId` VARCHAR(191) NOT NULL,
  MODIFY `branchId` VARCHAR(191) NOT NULL,
  DROP INDEX `LessonBalance_userId_key`,
  ADD UNIQUE INDEX `LessonBalance_userId_branchId_key`(`userId`, `branchId`);

-- Alter deductions and backfill from booking.
ALTER TABLE `LessonDeduction`
  ADD COLUMN `gymId` VARCHAR(191) NULL,
  ADD COLUMN `branchId` VARCHAR(191) NULL;

UPDATE `LessonDeduction` AS `deduction`
INNER JOIN `Booking` AS `booking` ON `deduction`.`bookingId` = `booking`.`id`
SET `deduction`.`gymId` = `booking`.`gymId`,
    `deduction`.`branchId` = `booking`.`branchId`;

ALTER TABLE `LessonDeduction`
  MODIFY `gymId` VARCHAR(191) NOT NULL,
  MODIFY `branchId` VARCHAR(191) NOT NULL;

-- Alter notification jobs and backfill from booking.
ALTER TABLE `NotificationJob`
  ADD COLUMN `gymId` VARCHAR(191) NULL,
  ADD COLUMN `branchId` VARCHAR(191) NULL;

UPDATE `NotificationJob` AS `job`
INNER JOIN `Booking` AS `booking` ON `job`.`bookingId` = `booking`.`id`
SET `job`.`gymId` = `booking`.`gymId`,
    `job`.`branchId` = `booking`.`branchId`;

ALTER TABLE `NotificationJob`
  MODIFY `gymId` VARCHAR(191) NOT NULL,
  MODIFY `branchId` VARCHAR(191) NOT NULL;

-- Create member branch rows for existing members and owner staff rows for existing admins.
INSERT INTO `MemberBranch` (`id`, `gymId`, `branchId`, `userId`, `memberNo`, `status`, `isDefault`, `joinedAt`, `createdAt`, `updatedAt`)
SELECT CONCAT('member_branch_', `User`.`id`), 'gym_default', 'branch_east', `User`.`id`, NULL, 'ACTIVE', true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `User`
WHERE `User`.`role` = 'USER';

INSERT INTO `StaffBranchAssignment` (`id`, `gymId`, `branchId`, `userId`, `role`, `startsAt`, `endsAt`, `status`, `createdAt`, `updatedAt`)
SELECT CONCAT('staff_owner_east_', `User`.`id`), 'gym_default', 'branch_east', `User`.`id`, 'OWNER', CURRENT_TIMESTAMP(3), NULL, 'ACTIVE', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `User`
WHERE `User`.`role` = 'ADMIN';

INSERT INTO `StaffBranchAssignment` (`id`, `gymId`, `branchId`, `userId`, `role`, `startsAt`, `endsAt`, `status`, `createdAt`, `updatedAt`)
SELECT CONCAT('staff_owner_west_', `User`.`id`), 'gym_default', 'branch_west', `User`.`id`, 'OWNER', CURRENT_TIMESTAMP(3), NULL, 'ACTIVE', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `User`
WHERE `User`.`role` = 'ADMIN';

-- Indexes for altered tables.
CREATE INDEX `BoxingClass_gymId_idx` ON `BoxingClass`(`gymId`);
CREATE INDEX `BoxingClass_branchId_startsAt_idx` ON `BoxingClass`(`branchId`, `startsAt`);
CREATE INDEX `BoxingClass_coachId_idx` ON `BoxingClass`(`coachId`);
CREATE INDEX `Booking_gymId_idx` ON `Booking`(`gymId`);
CREATE INDEX `Booking_branchId_idx` ON `Booking`(`branchId`);
CREATE INDEX `LessonBalance_gymId_idx` ON `LessonBalance`(`gymId`);
CREATE INDEX `LessonBalance_branchId_idx` ON `LessonBalance`(`branchId`);
CREATE INDEX `LessonDeduction_gymId_idx` ON `LessonDeduction`(`gymId`);
CREATE INDEX `LessonDeduction_branchId_idx` ON `LessonDeduction`(`branchId`);
CREATE INDEX `NotificationJob_gymId_idx` ON `NotificationJob`(`gymId`);
CREATE INDEX `NotificationJob_branchId_idx` ON `NotificationJob`(`branchId`);

-- Foreign keys.
ALTER TABLE `Branch` ADD CONSTRAINT `Branch_gymId_fkey` FOREIGN KEY (`gymId`) REFERENCES `Gym`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `MemberBranch` ADD CONSTRAINT `MemberBranch_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `MemberBranch` ADD CONSTRAINT `MemberBranch_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `StaffBranchAssignment` ADD CONSTRAINT `StaffBranchAssignment_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `StaffBranchAssignment` ADD CONSTRAINT `StaffBranchAssignment_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `BoxingClass` ADD CONSTRAINT `BoxingClass_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `BoxingClass` ADD CONSTRAINT `BoxingClass_coachId_fkey` FOREIGN KEY (`coachId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Booking` ADD CONSTRAINT `Booking_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `LessonBalance` ADD CONSTRAINT `LessonBalance_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `LessonDeduction` ADD CONSTRAINT `LessonDeduction_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `NotificationJob` ADD CONSTRAINT `NotificationJob_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
