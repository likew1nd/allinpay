-- P1 core domain tables. Secrets are deliberately represented by credential_ref only.
CREATE TYPE "SiteConnectionStatus" AS ENUM ('PENDING', 'ONLINE', 'OFFLINE', 'ERROR');
CREATE TYPE "SiteStructureStatus" AS ENUM ('UNKNOWN', 'COMPATIBLE', 'INCOMPATIBLE');
CREATE TYPE "SiteChannelStatus" AS ENUM ('ENABLED', 'DISABLED', 'UNKNOWN');
CREATE TYPE "SiteOrderStatus" AS ENUM ('SUCCESS', 'FAILED', 'PROCESSING', 'EXCLUDED');
CREATE TYPE "StrategyStatus" AS ENUM ('DRAFT', 'RUNNING', 'PAUSED', 'ERROR');

CREATE TABLE "epay_site" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "base_url" TEXT NOT NULL,
  "table_prefix" TEXT,
  "timezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  "db_host" TEXT NOT NULL,
  "db_port" INTEGER NOT NULL DEFAULT 3306,
  "db_name" TEXT NOT NULL,
  "db_user" TEXT NOT NULL,
  "credential_ref" TEXT NOT NULL,
  "connection_status" "SiteConnectionStatus" NOT NULL DEFAULT 'PENDING',
  "structure_status" "SiteStructureStatus" NOT NULL DEFAULT 'UNKNOWN',
  "structure_report" JSONB,
  "adapter_version" TEXT,
  "agent_version" TEXT,
  "last_heartbeat_at" TIMESTAMP(3),
  "last_sync_at" TIMESTAMP(3),
  "last_error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" TEXT NOT NULL,
  "updated_at" TIMESTAMP(3),
  "updated_by" TEXT,
  CONSTRAINT "epay_site_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "epay_site_connection_status_idx" ON "epay_site"("connection_status");

CREATE TABLE "epay_channel" (
  "id" TEXT NOT NULL,
  "site_id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "channel_type" TEXT,
  "status" "SiteChannelStatus" NOT NULL DEFAULT 'UNKNOWN',
  "current_weight" INTEGER NOT NULL DEFAULT 0,
  "source_version" TEXT,
  "updated_at" TIMESTAMP(3),
  CONSTRAINT "epay_channel_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "epay_channel_site_id_code_key" ON "epay_channel"("site_id", "code");
CREATE INDEX "epay_channel_site_id_status_idx" ON "epay_channel"("site_id", "status");
ALTER TABLE "epay_channel" ADD CONSTRAINT "epay_channel_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "epay_site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "epay_polling_group" (
  "id" TEXT NOT NULL,
  "site_id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" "SiteChannelStatus" NOT NULL DEFAULT 'UNKNOWN',
  "source_version" TEXT,
  CONSTRAINT "epay_polling_group_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "epay_polling_group_site_id_code_key" ON "epay_polling_group"("site_id", "code");
ALTER TABLE "epay_polling_group" ADD CONSTRAINT "epay_polling_group_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "epay_site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "epay_polling_member" (
  "group_id" TEXT NOT NULL,
  "channel_id" TEXT NOT NULL,
  "weight" INTEGER NOT NULL DEFAULT 0,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "epay_polling_member_pkey" PRIMARY KEY ("group_id", "channel_id")
);
ALTER TABLE "epay_polling_member" ADD CONSTRAINT "epay_polling_member_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "epay_polling_group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "epay_polling_member" ADD CONSTRAINT "epay_polling_member_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "epay_channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "epay_order" (
  "id" TEXT NOT NULL,
  "site_id" TEXT NOT NULL,
  "external_id" TEXT NOT NULL,
  "channel_code" TEXT,
  "amount" DECIMAL(18,2) NOT NULL,
  "source_status" TEXT NOT NULL,
  "status" "SiteOrderStatus" NOT NULL,
  "paid_at" TIMESTAMP(3),
  "occurred_at" TIMESTAMP(3) NOT NULL,
  "source_version" TEXT,
  CONSTRAINT "epay_order_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "epay_order_site_id_external_id_key" ON "epay_order"("site_id", "external_id");
CREATE INDEX "epay_order_site_id_status_occurred_at_idx" ON "epay_order"("site_id", "status", "occurred_at");
ALTER TABLE "epay_order" ADD CONSTRAINT "epay_order_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "epay_site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "epay_site_metric" (
  "id" TEXT NOT NULL,
  "site_id" TEXT NOT NULL,
  "window_start" TIMESTAMP(3) NOT NULL,
  "window_end" TIMESTAMP(3) NOT NULL,
  "order_count" INTEGER NOT NULL,
  "success_count" INTEGER NOT NULL,
  "failed_count" INTEGER NOT NULL,
  "success_rate" DECIMAL(7,4) NOT NULL,
  "failure_rate" DECIMAL(7,4) NOT NULL,
  "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "mapping_version" TEXT NOT NULL,
  CONSTRAINT "epay_site_metric_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "epay_site_metric_site_id_window_end_idx" ON "epay_site_metric"("site_id", "window_end");
ALTER TABLE "epay_site_metric" ADD CONSTRAINT "epay_site_metric_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "epay_site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "strategy_group" (
  "id" TEXT NOT NULL,
  "site_id" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "execution_order" INTEGER NOT NULL DEFAULT 0,
  "status" "StrategyStatus" NOT NULL DEFAULT 'DRAFT',
  "current_version" INTEGER NOT NULL DEFAULT 1,
  "last_run_at" TIMESTAMP(3),
  CONSTRAINT "strategy_group_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "strategy_group_site_id_status_idx" ON "strategy_group"("site_id", "status");
ALTER TABLE "strategy_group" ADD CONSTRAINT "strategy_group_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "epay_site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "strategy" (
  "id" TEXT NOT NULL,
  "group_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "condition" JSONB NOT NULL,
  "scope" JSONB NOT NULL,
  "action" JSONB NOT NULL,
  "schedule" TEXT,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "status" "StrategyStatus" NOT NULL DEFAULT 'DRAFT',
  "last_triggered_at" TIMESTAMP(3),
  CONSTRAINT "strategy_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "strategy_group_id_status_priority_idx" ON "strategy"("group_id", "status", "priority");
ALTER TABLE "strategy" ADD CONSTRAINT "strategy_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "strategy_group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "adjustment_record" (
  "id" TEXT NOT NULL,
  "site_id" TEXT NOT NULL,
  "strategy_id" TEXT,
  "action" TEXT NOT NULL,
  "target" JSONB NOT NULL,
  "before_state" JSONB,
  "desired_state" JSONB,
  "actual_state" JSONB,
  "status" TEXT NOT NULL,
  "failure_reason" TEXT,
  "idempotency_key" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  CONSTRAINT "adjustment_record_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "adjustment_record_idempotency_key_key" ON "adjustment_record"("idempotency_key");
CREATE INDEX "adjustment_record_site_id_created_at_idx" ON "adjustment_record"("site_id", "created_at");
ALTER TABLE "adjustment_record" ADD CONSTRAINT "adjustment_record_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "epay_site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
