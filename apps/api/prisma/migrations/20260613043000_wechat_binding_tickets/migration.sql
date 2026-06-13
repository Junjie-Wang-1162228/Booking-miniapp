CREATE TABLE `WechatBindingTicket` (
    `id` VARCHAR(191) NOT NULL,
    `appId` VARCHAR(191) NOT NULL,
    `openid` VARCHAR(191) NOT NULL,
    `unionid` VARCHAR(191) NULL,
    `code` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `expiresAt` DATETIME(3) NOT NULL,
    `boundUserId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `WechatBindingTicket_appId_openid_key`(`appId`, `openid`),
    UNIQUE INDEX `WechatBindingTicket_appId_code_key`(`appId`, `code`),
    INDEX `WechatBindingTicket_status_expiresAt_idx`(`status`, `expiresAt`),
    INDEX `WechatBindingTicket_boundUserId_idx`(`boundUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
