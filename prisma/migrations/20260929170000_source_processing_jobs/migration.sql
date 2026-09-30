CREATE TYPE "source_processing_status" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'UNSUPPORTED');

CREATE TABLE "source_processing_jobs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "project_id" UUID NOT NULL,
  "source_version_id" UUID NOT NULL,
  "status" "source_processing_status" NOT NULL DEFAULT 'QUEUED',
  "processor" TEXT NOT NULL,
  "error_message" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "source_processing_jobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "source_processing_jobs_source_version_id_key" ON "source_processing_jobs"("source_version_id");
CREATE INDEX "source_processing_jobs_project_id_status_idx" ON "source_processing_jobs"("project_id", "status");

ALTER TABLE "source_processing_jobs" ADD CONSTRAINT "source_processing_jobs_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "source_processing_jobs" ADD CONSTRAINT "source_processing_jobs_source_version_id_project_id_fkey"
  FOREIGN KEY ("source_version_id", "project_id") REFERENCES "artifact_versions"("id", "project_id") ON DELETE CASCADE ON UPDATE CASCADE;
