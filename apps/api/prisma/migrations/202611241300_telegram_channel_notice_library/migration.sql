ALTER TABLE `telegram_bot`
  ADD COLUMN `channel_status_notice_saved_templates` MEDIUMTEXT NOT NULL DEFAULT ('[]'),
  MODIFY COLUMN `channel_status_notice_template` TEXT NOT NULL DEFAULT ('%ZT %ZD %BH %MC 收款/限额 %SK/%SKXE 笔数/限额 %BS/%BSXE 总收款/总笔数 %ZSK/%ZBS 5分 %5FCGL/%5FSK 15分 %15FCGL/%15FSK 30分 %30FCGL/%30FSK 60分 %60FCGL/%60FSK 全天 %QTCGL/%QTSK');

UPDATE `telegram_bot` SET `channel_status_notice_template` = DEFAULT
WHERE BINARY `channel_status_notice_template` = '站点：%ZD\n通道：%BH %MC\n状态：%ZT\n收款/限额：%SK/%SKXE\n笔数/限额：%BS/%BSXE\n总收款/总笔数：%ZSK/%ZBS\n5分：%5FCGL / %5FBS / %5FSK\n15分：%15FCGL / %15FBS / %15FSK\n30分：%30FCGL / %30FBS / %30FSK\n60分：%60FCGL / %60FBS / %60FSK\n全天：%QTCGL / %QTBS / %QTSK';
