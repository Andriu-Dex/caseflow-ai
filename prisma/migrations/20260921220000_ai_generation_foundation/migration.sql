-- Increment 1C: provider-independent AI invocation audit metadata.
CREATE TYPE "ai_run_status" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');
CREATE TYPE "ai_error_code" AS ENUM ('AI_NOT_CONFIGURED', 'AI_PROVIDER_UNAVAILABLE', 'AI_TIMEOUT', 'AI_RATE_LIMITED', 'AI_INVALID_OUTPUT', 'AI_PROVIDER_ERROR');

CREATE UNIQUE INDEX "artifact_versions_id_project_id_key" ON "artifact_versions" ("id", "project_id");

CREATE TABLE "ai_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID,
    "source_artifact_version_id" UUID,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "capability" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "prompt_key" TEXT NOT NULL,
    "prompt_version" INTEGER NOT NULL,
    "status" "ai_run_status" NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "latency_ms" INTEGER,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "total_tokens" INTEGER,
    "error_code" "ai_error_code",
    "input_hash" CHAR(64) NOT NULL,
    "output_hash" CHAR(64),
    CONSTRAINT "ai_runs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ai_runs_prompt_version_check" CHECK ("prompt_version" > 0),
    CONSTRAINT "ai_runs_latency_check" CHECK ("latency_ms" IS NULL OR "latency_ms" >= 0),
    CONSTRAINT "ai_runs_usage_check" CHECK (
      ("input_tokens" IS NULL OR "input_tokens" >= 0) AND
      ("output_tokens" IS NULL OR "output_tokens" >= 0) AND
      ("total_tokens" IS NULL OR "total_tokens" >= 0)
    ),
    CONSTRAINT "ai_runs_hashes_check" CHECK (
      "input_hash" ~ '^[0-9a-f]{64}$' AND ("output_hash" IS NULL OR "output_hash" ~ '^[0-9a-f]{64}$')
    ),
    CONSTRAINT "ai_runs_source_requires_project_check" CHECK ("source_artifact_version_id" IS NULL OR "project_id" IS NOT NULL),
    CONSTRAINT "ai_runs_state_check" CHECK (
      ("status" = 'RUNNING' AND "completed_at" IS NULL AND "error_code" IS NULL AND "output_hash" IS NULL) OR
      ("status" = 'SUCCEEDED' AND "completed_at" IS NOT NULL AND "error_code" IS NULL AND "output_hash" IS NOT NULL) OR
      ("status" = 'FAILED' AND "completed_at" IS NOT NULL AND "error_code" IS NOT NULL)
    )
);

CREATE INDEX "ai_runs_project_id_started_at_id_idx" ON "ai_runs" ("project_id", "started_at", "id");
CREATE INDEX "ai_runs_source_artifact_version_id_idx" ON "ai_runs" ("source_artifact_version_id");

ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_source_artifact_version_id_project_id_fkey"
  FOREIGN KEY ("source_artifact_version_id", "project_id") REFERENCES "artifact_versions"("id", "project_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
