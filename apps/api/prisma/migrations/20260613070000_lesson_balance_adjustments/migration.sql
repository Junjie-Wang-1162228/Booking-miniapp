CREATE TABLE `LessonBalanceAdjustment` (
    `id` VARCHAR(191) NOT NULL,
    `gymId` VARCHAR(191) NOT NULL,
    `branchId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `adminId` VARCHAR(191) NOT NULL,
    `delta` INTEGER NOT NULL,
    `beforeRemaining` INTEGER NOT NULL,
    `afterRemaining` INTEGER NOT NULL,
    `reason` VARCHAR(300) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `LessonBalanceAdjustment_gymId_idx`(`gymId`),
    INDEX `LessonBalanceAdjustment_branchId_createdAt_idx`(`branchId`, `createdAt`),
    INDEX `LessonBalanceAdjustment_userId_branchId_createdAt_idx`(`userId`, `branchId`, `createdAt`),
    INDEX `LessonBalanceAdjustment_adminId_idx`(`adminId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `LessonBalanceAdjustment` ADD CONSTRAINT `LessonBalanceAdjustment_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `LessonBalanceAdjustment` ADD CONSTRAINT `LessonBalanceAdjustment_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `LessonBalanceAdjustment` ADD CONSTRAINT `LessonBalanceAdjustment_adminId_fkey` FOREIGN KEY (`adminId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
