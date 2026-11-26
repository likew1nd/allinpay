-- JWTs exceed Prisma's default MySQL VARCHAR(191). ASCII binary comparison
-- preserves token case and allows full token indexes within InnoDB's key limit.
ALTER TABLE `sys_tokens`
    MODIFY `access_token` VARCHAR(2048) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    MODIFY `refresh_token` VARCHAR(2048) CHARACTER SET ascii COLLATE ascii_bin NOT NULL;
