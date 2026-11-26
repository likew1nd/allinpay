ALTER TABLE `telegram_bot`
  ADD COLUMN `channel_status_notice_enabled` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `channel_status_notice_interval_minutes` INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN `channel_status_notice_sent_at` DATETIME(3) NULL,
  ADD COLUMN `channel_status_notice_template` TEXT NOT NULL DEFAULT ('站点：%ZD\n通道：%BH %MC\n状态：%ZT\n收款/限额：%SK/%SKXE\n笔数/限额：%BS/%BSXE\n总收款/总笔数：%ZSK/%ZBS\n5分：%5FCGL / %5FBS / %5FSK\n15分：%15FCGL / %15FBS / %15FSK\n30分：%30FCGL / %30FBS / %30FSK\n60分：%60FCGL / %60FBS / %60FSK\n全天：%QTCGL / %QTBS / %QTSK');
