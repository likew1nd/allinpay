ALTER TABLE `fund_account` DROP INDEX `fund_account_status_currency_idx`;
ALTER TABLE `fund_account` DROP COLUMN `currency`;

ALTER TABLE `account` DROP COLUMN `balance_currency`;
ALTER TABLE `payee` DROP COLUMN `currency`;
ALTER TABLE `transfer_request` DROP COLUMN `currency`;
ALTER TABLE `payment_request` DROP COLUMN `currency`;
ALTER TABLE `settlement_record` DROP COLUMN `currency`;
