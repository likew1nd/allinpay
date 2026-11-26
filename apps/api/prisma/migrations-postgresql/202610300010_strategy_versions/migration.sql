-- P7 strategy version snapshots and effective windows.
ALTER TABLE "strategy"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "effective_from" TIMESTAMP(3),
  ADD COLUMN "effective_to" TIMESTAMP(3);

CREATE TABLE "strategy_version" (
  "id" TEXT NOT NULL,
  "strategy_id" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "condition" JSONB NOT NULL,
  "scope" JSONB NOT NULL,
  "action" JSONB NOT NULL,
  "schedule" TEXT,
  "priority" INTEGER NOT NULL,
  "effective_from" TIMESTAMP(3),
  "effective_to" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "strategy_version_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "strategy_version_strategy_id_version_key" ON "strategy_version"("strategy_id", "version");
CREATE INDEX "strategy_version_strategy_id_created_at_idx" ON "strategy_version"("strategy_id", "created_at");
ALTER TABLE "strategy_version" ADD CONSTRAINT "strategy_version_strategy_id_fkey" FOREIGN KEY ("strategy_id") REFERENCES "strategy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
