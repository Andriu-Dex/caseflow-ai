-- DEC-139: batched, resumable use case generation.
CREATE TABLE "use_case_generation_jobs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "project_id" UUID NOT NULL,
  "status" "source_processing_status" NOT NULL DEFAULT 'QUEUED',
  "total_batches" INTEGER NOT NULL DEFAULT 0 CHECK (total_batches >= 0),
  "completed_batches" INTEGER NOT NULL DEFAULT 0 CHECK (completed_batches >= 0 AND completed_batches <= total_batches),
  "output_chars" INTEGER NOT NULL DEFAULT 0 CHECK (output_chars >= 0),
  "generation_id" UUID, "error_message" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "use_case_generation_jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "use_case_generation_jobs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "use_case_generation_jobs_generation_id_fkey" FOREIGN KEY ("generation_id") REFERENCES "use_case_generations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "use_case_generation_jobs_status_check" CHECK (status IN ('QUEUED','RUNNING','COMPLETED','FAILED'))
);
CREATE UNIQUE INDEX "use_case_generation_jobs_generation_id_key" ON "use_case_generation_jobs"("generation_id");
CREATE INDEX "use_case_generation_jobs_project_id_created_at_idx" ON "use_case_generation_jobs"("project_id", "created_at");
CREATE UNIQUE INDEX "use_case_generation_jobs_one_active" ON "use_case_generation_jobs"("project_id") WHERE status IN ('QUEUED','RUNNING');
CREATE TABLE "use_case_generation_job_sources" (
  "job_id" UUID NOT NULL, "requirement_version_id" UUID NOT NULL, "position" INTEGER NOT NULL CHECK (position >= 0),
  CONSTRAINT "use_case_generation_job_sources_pkey" PRIMARY KEY ("job_id", "requirement_version_id"),
  CONSTRAINT "use_case_generation_job_sources_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "use_case_generation_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "use_case_generation_job_sources_requirement_version_id_fkey" FOREIGN KEY ("requirement_version_id") REFERENCES "artifact_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "use_case_generation_parts" (
  "job_id" UUID NOT NULL, "position" INTEGER NOT NULL CHECK (position >= 0), "ai_run_id" UUID NOT NULL, "content" JSONB NOT NULL,
  CONSTRAINT "use_case_generation_parts_pkey" PRIMARY KEY ("job_id", "position"),
  CONSTRAINT "use_case_generation_parts_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "use_case_generation_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "use_case_generation_parts_ai_run_id_fkey" FOREIGN KEY ("ai_run_id") REFERENCES "ai_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
