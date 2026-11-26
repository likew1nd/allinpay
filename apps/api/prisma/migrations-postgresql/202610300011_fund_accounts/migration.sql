CREATE TABLE IF NOT EXISTS "fund_account" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "owner" TEXT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'CNY',
  "balance" DECIMAL(20,2) NOT NULL DEFAULT 0,
  "frozen" DECIMAL(20,2) NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "fund_account_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "fund_account_status_currency_idx" ON "fund_account"("status", "currency");
