-- 统一到此前 MySQL 8.4 镜像实际执行的 SQL。仅对齐已成功应用的已知等价版本。
UPDATE `_prisma_migrations`
SET `checksum` = '31b4365d46e70927555b187c75c656fff735a812aaa7a1fb7df4d64a3a531706'
WHERE `migration_name` = '202611241300_telegram_channel_notice_library'
  AND `finished_at` IS NOT NULL AND `rolled_back_at` IS NULL
  AND `checksum` IN (
    '5aea32e0ddc8ed00d4799580f263aae30fa7eb03a83d6d6d7bceee75e2e3dfef',
    '0075a15326eaa7746e75752bc0a02157133c8b24b4ff63482c1dd89d7aaff7ca',
    'ea63cef2d147638b0bca02e7ec38840f860a85a19460be68850d972ef218ec36'
  );
