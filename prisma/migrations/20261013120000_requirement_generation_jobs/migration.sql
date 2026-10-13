ALTER TABLE "ai_runs" ADD COLUMN "error_details" JSONB;
ALTER TABLE "requirement_candidates" ADD COLUMN "ai_run_id" UUID;
ALTER TABLE "requirement_candidates" ADD CONSTRAINT "requirement_candidates_ai_run_id_fkey" FOREIGN KEY ("ai_run_id") REFERENCES "ai_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "requirement_generations_id_project_id_key" ON "requirement_generations"("id", "project_id");
CREATE TABLE "requirement_generation_jobs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "project_id" UUID NOT NULL,
  "source_context_version_id" UUID NOT NULL,
  "status" "source_processing_status" NOT NULL DEFAULT 'QUEUED',
  "total_batches" INTEGER NOT NULL DEFAULT 0 CHECK (total_batches >= 0),
  "completed_batches" INTEGER NOT NULL DEFAULT 0 CHECK (completed_batches >= 0 AND completed_batches <= total_batches),
  "output_chars" INTEGER NOT NULL DEFAULT 0 CHECK (output_chars >= 0),
  "generation_id" UUID, "error_message" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "requirement_generation_jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "requirement_generation_jobs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "requirement_generation_jobs_source_context_fkey" FOREIGN KEY ("source_context_version_id", "project_id") REFERENCES "artifact_versions"("id", "project_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "requirement_generation_jobs_generation_fkey" FOREIGN KEY ("generation_id", "project_id") REFERENCES "requirement_generations"("id", "project_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "requirement_generation_jobs_status_check" CHECK (status IN ('QUEUED','RUNNING','COMPLETED','FAILED'))
);
CREATE UNIQUE INDEX "requirement_generation_jobs_generation_id_key" ON "requirement_generation_jobs"("generation_id");
CREATE UNIQUE INDEX "requirement_generation_jobs_generation_id_project_id_key" ON "requirement_generation_jobs"("generation_id", "project_id");
CREATE INDEX "requirement_generation_jobs_project_id_created_at_idx" ON "requirement_generation_jobs"("project_id", "created_at");
CREATE UNIQUE INDEX "requirement_generation_jobs_one_active" ON "requirement_generation_jobs"("project_id") WHERE status IN ('QUEUED','RUNNING');
CREATE TABLE "requirement_generation_parts" (
  "job_id" UUID NOT NULL, "position" INTEGER NOT NULL CHECK (position >= 0), "ai_run_id" UUID NOT NULL, "content" JSONB NOT NULL,
  CONSTRAINT "requirement_generation_parts_pkey" PRIMARY KEY ("job_id", "position"),
  CONSTRAINT "requirement_generation_parts_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "requirement_generation_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "requirement_generation_parts_ai_run_id_fkey" FOREIGN KEY ("ai_run_id") REFERENCES "ai_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
