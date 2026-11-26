DROP INDEX IF EXISTS "fund_account_status_currency_idx";

ALTER TABLE "fund_account" DROP COLUMN IF EXISTS "currency";
ALTER TABLE "payment_request" DROP COLUMN IF EXISTS "currency";
ALTER TABLE "settlement_record" DROP COLUMN IF EXISTS "currency";
