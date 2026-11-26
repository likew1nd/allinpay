-- P6 script collectors, account health and site-channel bindings.
CREATE TYPE "CollectorStatus" AS ENUM ('ONLINE', 'OFFLINE', 'ERROR');
CREATE TYPE "AccountStatus" AS ENUM ('HEALTHY', 'DEGRADED', 'AUTH_EXPIRED', 'CAPTCHA_REQUIRED', 'ENV_UNAVAILABLE', 'UNKNOWN');

CREATE TABLE "collector" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "token_encrypted" TEXT,
  "status" "CollectorStatus" NOT NULL DEFAULT 'OFFLINE',
  "version" TEXT,
  "last_heartbeat_at" TIMESTAMP(3),
  "last_error" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3),
  CONSTRAINT "collector_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "collector_status_last_heartbeat_at_idx" ON "collector"("status", "last_heartbeat_at");

CREATE TABLE "account" (
  "id" TEXT NOT NULL,
  "collector_id" TEXT,
  "external_id" TEXT NOT NULL,
  "name" TEXT,
  "status" "AccountStatus" NOT NULL DEFAULT 'UNKNOWN',
  "browser_state" TEXT,
  "last_seen_at" TIMESTAMP(3),
  "last_error" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3),
  CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "account_collector_id_external_id_key" ON "account"("collector_id", "external_id");
CREATE INDEX "account_status_last_seen_at_idx" ON "account"("status", "last_seen_at");
ALTER TABLE "account" ADD CONSTRAINT "account_collector_id_fkey" FOREIGN KEY ("collector_id") REFERENCES "collector"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "account_binding" (
  "id" TEXT NOT NULL,
  "account_id" TEXT NOT NULL,
  "site_id" TEXT NOT NULL,
  "channel_code" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3),
  CONSTRAINT "account_binding_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "account_binding_account_id_site_id_channel_code_key" ON "account_binding"("account_id", "site_id", "channel_code");
CREATE INDEX "account_binding_site_id_channel_code_enabled_idx" ON "account_binding"("site_id", "channel_code", "enabled");
ALTER TABLE "account_binding" ADD CONSTRAINT "account_binding_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "account_binding" ADD CONSTRAINT "account_binding_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "epay_site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
