CREATE TABLE IF NOT EXISTS "strategy_group_binding" (
  "id" TEXT NOT NULL,
  "group_id" TEXT NOT NULL,
  "site_id" TEXT NOT NULL,
  "polling_group_code" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "strategy_group_binding_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "strategy_group_binding_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "strategy_group"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "strategy_group_binding_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "epay_site"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "strategy_group_binding_group_site_polling_key" ON "strategy_group_binding"("group_id", "site_id", "polling_group_code");
CREATE INDEX IF NOT EXISTS "strategy_group_binding_site_polling_enabled_idx" ON "strategy_group_binding"("site_id", "polling_group_code", "enabled");
