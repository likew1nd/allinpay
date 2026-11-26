-- P4 strategy execution and site-agent control queue.
ALTER TABLE "epay_site" ADD COLUMN "automation_paused" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "adjustment_record"
  ADD COLUMN "strategy_version" INTEGER,
  ADD COLUMN "target_version" TEXT,
  ADD COLUMN "expires_at" TIMESTAMP(3);
CREATE INDEX "adjustment_record_site_id_status_created_at_idx"
  ON "adjustment_record"("site_id", "status", "created_at");
