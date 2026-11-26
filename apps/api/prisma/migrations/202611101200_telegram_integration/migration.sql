-- CreateTable
CREATE TABLE `telegram_bot` (
    `id` VARCHAR(191) NOT NULL DEFAULT 'default',
    `botId` VARCHAR(191) NULL,
    `username` VARCHAR(191) NULL,
    `displayName` VARCHAR(191) NULL,
    `tokenEncrypted` TEXT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `version` INTEGER NOT NULL DEFAULT 0,
    `credentialsVersion` INTEGER NOT NULL DEFAULT 0,
    `dispatchEpoch` INTEGER NOT NULL DEFAULT 0,
    `enabledAt` DATETIME(3) NULL,
    `nextUpdateOffset` INTEGER NOT NULL DEFAULT 0,
    `leaseOwner` VARCHAR(191) NULL,
    `leaseUntil` DATETIME(3) NULL,
    `heartbeatAt` DATETIME(3) NULL,
    `lastReceivedAt` DATETIME(3) NULL,
    `lastSentAt` DATETIME(3) NULL,
    `lastCheckedAt` DATETIME(3) NULL,
    `lastError` VARCHAR(500) NULL,
    `menuVersion` INTEGER NOT NULL DEFAULT 0,
    `menuSyncedVersion` INTEGER NOT NULL DEFAULT -1,
    `menuError` VARCHAR(500) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `telegram_target` (
    `id` VARCHAR(191) NOT NULL,
    `botId` VARCHAR(191) NOT NULL,
    `chatId` VARCHAR(191) NOT NULL,
    `threadKey` INTEGER NOT NULL DEFAULT 0,
    `name` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `verified` BOOLEAN NOT NULL DEFAULT true,
    `archived` BOOLEAN NOT NULL DEFAULT false,
    `scope` JSON NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 0,
    `lastError` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `telegram_target_botId_archived_enabled_idx`(`botId`, `archived`, `enabled`),
    UNIQUE INDEX `telegram_target_botId_chatId_threadKey_key`(`botId`, `chatId`, `threadKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `telegram_subscription` (
    `id` VARCHAR(191) NOT NULL,
    `targetId` VARCHAR(191) NOT NULL,
    `eventType` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `repeatIntervalMinutes` INTEGER NOT NULL DEFAULT 0,
    `sendRecovery` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `telegram_subscription_targetId_eventType_key`(`targetId`, `eventType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `telegram_user_binding` (
    `id` VARCHAR(191) NOT NULL,
    `botId` VARCHAR(191) NOT NULL,
    `telegramUserId` VARCHAR(191) NOT NULL,
    `sysUserId` VARCHAR(191) NOT NULL,
    `displayName` VARCHAR(191) NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `allowedTargetIds` JSON NOT NULL,
    `scope` JSON NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `telegram_user_binding_botId_telegramUserId_key`(`botId`, `telegramUserId`),
    UNIQUE INDEX `telegram_user_binding_botId_sysUserId_key`(`botId`, `sysUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `telegram_command` (
    `id` VARCHAR(191) NOT NULL,
    `botId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(32) NOT NULL,
    `description` VARCHAR(256) NOT NULL,
    `actionKey` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `allowedTargetIds` JSON NOT NULL,
    `allowedBindingIds` JSON NOT NULL,
    `defaults` JSON NOT NULL,
    `confirmRequired` BOOLEAN NOT NULL DEFAULT false,
    `version` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `telegram_command_botId_name_key`(`botId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `telegram_challenge` (
    `id` VARCHAR(191) NOT NULL,
    `botId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `codeHash` VARCHAR(64) NOT NULL,
    `sysUserId` VARCHAR(191) NOT NULL,
    `expectedTelegramId` VARCHAR(191) NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `consumedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `telegram_challenge_codeHash_key`(`codeHash`),
    INDEX `telegram_challenge_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `telegram_update` (
    `id` VARCHAR(191) NOT NULL,
    `botId` VARCHAR(191) NOT NULL,
    `updateId` INTEGER NOT NULL,
    `epoch` INTEGER NOT NULL,
    `payload` JSON NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `error` VARCHAR(300) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `telegram_update_botId_status_updateId_idx`(`botId`, `status`, `updateId`),
    UNIQUE INDEX `telegram_update_botId_updateId_key`(`botId`, `updateId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `telegram_command_execution` (
    `id` VARCHAR(191) NOT NULL,
    `botId` VARCHAR(191) NOT NULL,
    `updateId` INTEGER NOT NULL,
    `commandId` VARCHAR(191) NOT NULL,
    `commandVersion` INTEGER NOT NULL,
    `bindingId` VARCHAR(191) NOT NULL,
    `bindingVersion` INTEGER NOT NULL,
    `targetId` VARCHAR(191) NOT NULL,
    `targetVersion` INTEGER NOT NULL,
    `actorUserId` VARCHAR(191) NOT NULL,
    `telegramUserId` VARCHAR(191) NOT NULL,
    `actionKey` VARCHAR(191) NOT NULL,
    `objectId` VARCHAR(191) NULL,
    `params` JSON NOT NULL,
    `epoch` INTEGER NOT NULL,
    `confirmTokenHash` VARCHAR(64) NULL,
    `expiresAt` DATETIME(3) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `result` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completedAt` DATETIME(3) NULL,

    UNIQUE INDEX `telegram_command_execution_confirmTokenHash_key`(`confirmTokenHash`),
    INDEX `telegram_command_execution_targetId_createdAt_idx`(`targetId`, `createdAt`),
    INDEX `telegram_command_execution_status_expiresAt_idx`(`status`, `expiresAt`),
    UNIQUE INDEX `telegram_command_execution_botId_updateId_key`(`botId`, `updateId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notification_incident` (
    `id` VARCHAR(191) NOT NULL,
    `entityType` VARCHAR(191) NOT NULL,
    `entityId` VARCHAR(191) NOT NULL,
    `eventType` VARCHAR(191) NOT NULL,
    `cause` VARCHAR(191) NOT NULL DEFAULT '',
    `activeKey` VARCHAR(64) NULL,
    `title` VARCHAR(300) NOT NULL,
    `occurredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastObservedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `recoveredAt` DATETIME(3) NULL,
    `acknowledgedAt` DATETIME(3) NULL,
    `acknowledgedBy` VARCHAR(191) NULL,
    `lastAnnouncedEpoch` INTEGER NOT NULL DEFAULT -1,

    UNIQUE INDEX `notification_incident_activeKey_key`(`activeKey`),
    INDEX `notification_incident_entityType_entityId_eventType_idx`(`entityType`, `entityId`, `eventType`),
    INDEX `notification_incident_recoveredAt_occurredAt_idx`(`recoveredAt`, `occurredAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notification_event` (
    `id` VARCHAR(191) NOT NULL,
    `incidentId` VARCHAR(191) NOT NULL,
    `phase` VARCHAR(191) NOT NULL,
    `sourceId` VARCHAR(191) NOT NULL,
    `eventKey` VARCHAR(64) NOT NULL,
    `telegramEpoch` INTEGER NULL,
    `targetId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expandedAt` DATETIME(3) NULL,
    `skippedReason` VARCHAR(191) NULL,

    UNIQUE INDEX `notification_event_eventKey_key`(`eventKey`),
    INDEX `notification_event_expandedAt_createdAt_idx`(`expandedAt`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `telegram_delivery` (
    `id` VARCHAR(191) NOT NULL,
    `botId` VARCHAR(191) NOT NULL,
    `epoch` INTEGER NOT NULL,
    `eventId` VARCHAR(191) NULL,
    `incidentId` VARCHAR(191) NULL,
    `commandExecutionId` VARCHAR(191) NULL,
    `dedupeKey` VARCHAR(64) NOT NULL,
    `targetId` VARCHAR(191) NULL,
    `chatId` VARCHAR(191) NOT NULL,
    `threadKey` INTEGER NOT NULL DEFAULT 0,
    `kind` VARCHAR(191) NOT NULL,
    `text` TEXT NOT NULL,
    `buttons` JSON NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `nextAttemptAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `leaseOwner` VARCHAR(191) NULL,
    `leaseUntil` DATETIME(3) NULL,
    `messageId` INTEGER NULL,
    `error` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `sentAt` DATETIME(3) NULL,

    UNIQUE INDEX `telegram_delivery_dedupeKey_key`(`dedupeKey`),
    INDEX `telegram_delivery_botId_status_nextAttemptAt_idx`(`botId`, `status`, `nextAttemptAt`),
    INDEX `telegram_delivery_targetId_createdAt_idx`(`targetId`, `createdAt`),
    INDEX `telegram_delivery_incidentId_targetId_idx`(`incidentId`, `targetId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `telegram_incident_preference` (
    `id` VARCHAR(191) NOT NULL,
    `incidentId` VARCHAR(191) NOT NULL,
    `targetId` VARCHAR(191) NOT NULL,
    `mutedUntil` DATETIME(3) NOT NULL,
    `updatedBy` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `telegram_incident_preference_incidentId_targetId_key`(`incidentId`, `targetId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;


-- 补齐存量系统菜单与管理员权限，不覆盖已有角色配置。
INSERT INTO sys_menu (menu_type, menu_name, icon_type, icon, route_name, route_path, component, status, pid, sequence, i18n_key, created_by)
SELECT 'menu', 'Telegram 设置', 1, 'tabler:brand-telegram', 'system-settings_telegram', '/system-settings/telegram', 'view.system-settings_telegram', 'ENABLED', parent.id, 9, 'route.system-settings_telegram', '-1'
FROM sys_menu parent WHERE parent.route_name = 'system-settings'
AND NOT EXISTS (SELECT 1 FROM sys_menu existing WHERE existing.route_name = 'system-settings_telegram');

INSERT INTO sys_role_menu (role_id, menu_id, domain)
SELECT r.id, m.id, 'built-in' FROM sys_role r CROSS JOIN sys_menu m
WHERE r.code IN ('ROLE_SUPER', 'ROLE_ADMIN') AND m.route_name IN ('system-settings', 'system-settings_telegram')
AND NOT EXISTS (SELECT 1 FROM sys_role_menu rm WHERE rm.role_id = r.id AND rm.menu_id = m.id AND rm.domain = 'built-in');

INSERT INTO casbin_rule (ptype, v0, v1, v2, v3)
SELECT 'p', roles.code, permissions.resource, permissions.action, 'built-in'
FROM (SELECT 'ROLE_SUPER' AS code UNION ALL SELECT 'ROLE_ADMIN') roles
CROSS JOIN (
 SELECT 'telegram' AS resource, 'read' AS action UNION ALL SELECT 'telegram', 'create'
 UNION ALL SELECT 'telegram', 'update' UNION ALL SELECT 'telegram', 'delete'
 UNION ALL SELECT 'telegram', 'test' UNION ALL SELECT 'telegram', 'retry'
 UNION ALL SELECT 'notification', 'read' UNION ALL SELECT 'notification', 'update'
) permissions
WHERE NOT EXISTS (SELECT 1 FROM casbin_rule c WHERE c.ptype = 'p' AND c.v0 = roles.code AND c.v1 = permissions.resource AND c.v2 = permissions.action AND c.v3 = 'built-in');