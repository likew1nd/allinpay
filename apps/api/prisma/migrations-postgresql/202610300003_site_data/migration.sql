-- Additive site data synchronization schema; preserve existing IAM and site records.
ALTER TABLE "epay_site" ADD COLUMN "sync_revision" INTEGER NOT NULL DEFAULT 1, ADD COLUMN "active_sync_id" TEXT;
ALTER TABLE "epay_channel" ADD COLUMN "plugin" TEXT, ADD COLUMN "payment_type_id" TEXT,
 ADD COLUMN "source_status" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "day_status" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "epay_polling_group" ADD COLUMN "kind" INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "payment_type_id" TEXT,
 ADD COLUMN "payment_type_name" TEXT, ADD COLUMN "updated_at" TIMESTAMP(3);
ALTER TABLE "epay_polling_member" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "epay_sync_run" (
 "id" TEXT NOT NULL PRIMARY KEY, "site_id" TEXT NOT NULL, "revision" INTEGER NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'RUNNING', "window_start" TIMESTAMP(3) NOT NULL,
 "window_end" TIMESTAMP(3) NOT NULL, "mapping_version" TEXT NOT NULL, "metadata" JSONB NOT NULL,
 "pages" JSONB NOT NULL DEFAULT '[]', "order_count" INTEGER NOT NULL DEFAULT 0,
 "expected_count" INTEGER NOT NULL, "error" TEXT, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "completed_at" TIMESTAMP(3), CONSTRAINT "epay_sync_run_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "epay_site"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
ALTER TABLE "epay_order" ADD COLUMN "sync_run_id" TEXT, ADD COLUMN "merchant_id" TEXT,
 ADD COLUMN "payment_type_id" TEXT, ADD COLUMN "payment_type_name" TEXT,
 ADD COLUMN "subchannel_code" TEXT, ADD COLUMN "real_amount" DECIMAL(18,2);
ALTER TABLE "epay_order" ADD CONSTRAINT "epay_order_sync_run_id_fkey" FOREIGN KEY ("sync_run_id") REFERENCES "epay_sync_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;
DROP INDEX "epay_order_site_id_external_id_key";
CREATE UNIQUE INDEX "epay_order_sync_run_id_external_id_key" ON "epay_order"("sync_run_id", "external_id");
CREATE INDEX "epay_order_site_id_sync_run_id_occurred_at_idx" ON "epay_order"("site_id", "sync_run_id", "occurred_at");
CREATE INDEX "epay_sync_run_site_id_created_at_idx" ON "epay_sync_run"("site_id", "created_at");
