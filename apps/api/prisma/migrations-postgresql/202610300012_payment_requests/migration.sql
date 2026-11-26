CREATE TABLE IF NOT EXISTS "payment_request" (
  "id" TEXT NOT NULL,
  "fund_account_id" TEXT NOT NULL,
  "amount" DECIMAL(20,2) NOT NULL,
  "currency" TEXT NOT NULL,
  "payee" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "requester" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payment_request_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_request_fund_account_id_fkey" FOREIGN KEY ("fund_account_id") REFERENCES "fund_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "payment_request_status_created_at_idx" ON "payment_request"("status", "created_at");
