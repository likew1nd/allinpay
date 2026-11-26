CREATE TABLE IF NOT EXISTS "settlement_record" (
  "id" TEXT NOT NULL,
  "fund_account_id" TEXT NOT NULL,
  "period_start" TIMESTAMP(3) NOT NULL,
  "period_end" TIMESTAMP(3) NOT NULL,
  "amount" DECIMAL(20,2) NOT NULL,
  "fee" DECIMAL(20,2) NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "settlement_record_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "settlement_record_fund_account_id_fkey" FOREIGN KEY ("fund_account_id") REFERENCES "fund_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "settlement_record_status_period_end_idx" ON "settlement_record"("status", "period_end");
