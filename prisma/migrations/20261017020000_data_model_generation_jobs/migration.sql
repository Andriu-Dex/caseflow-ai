-- DEC-144: batched, resumable data model generation.
CREATE TABLE "data_model_generation_jobs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "project_id" UUID NOT NULL,
  "status" "source_processing_status" NOT NULL DEFAULT 'QUEUED',
  "total_batches" INTEGER NOT NULL DEFAULT 0 CHECK (total_batches >= 0),
  "completed_batches" INTEGER NOT NULL DEFAULT 0 CHECK (completed_batches >= 0 AND completed_batches <= total_batches),
  "output_chars" INTEGER NOT NULL DEFAULT 0 CHECK (output_chars >= 0),
  "generation_id" UUID, "error_message" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "data_model_generation_jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "data_model_generation_jobs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "data_model_generation_jobs_generation_id_fkey" FOREIGN KEY ("generation_id") REFERENCES "data_model_generations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "data_model_generation_jobs_status_check" CHECK (status IN ('QUEUED','RUNNING','COMPLETED','FAILED'))
);
CREATE UNIQUE INDEX "data_model_generation_jobs_generation_id_key" ON "data_model_generation_jobs"("generation_id");
CREATE INDEX "data_model_generation_jobs_project_id_created_at_idx" ON "data_model_generation_jobs"("project_id", "created_at");
CREATE UNIQUE INDEX "data_model_generation_jobs_one_active" ON "data_model_generation_jobs"("project_id") WHERE status IN ('QUEUED','RUNNING');
CREATE TABLE "data_model_generation_job_sources" (
  "job_id" UUID NOT NULL, "artifact_version_id" UUID NOT NULL, "position" INTEGER NOT NULL CHECK (position >= 0),
  CONSTRAINT "data_model_generation_job_sources_pkey" PRIMARY KEY ("job_id", "artifact_version_id"),
  CONSTRAINT "data_model_generation_job_sources_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "data_model_generation_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "data_model_generation_job_sources_artifact_version_id_fkey" FOREIGN KEY ("artifact_version_id") REFERENCES "artifact_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "data_model_generation_parts" (
  "job_id" UUID NOT NULL, "position" INTEGER NOT NULL CHECK (position >= 0), "ai_run_id" UUID NOT NULL, "content" JSONB NOT NULL,
  CONSTRAINT "data_model_generation_parts_pkey" PRIMARY KEY ("job_id", "position"),
  CONSTRAINT "data_model_generation_parts_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "data_model_generation_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "data_model_generation_parts_ai_run_id_fkey" FOREIGN KEY ("ai_run_id") REFERENCES "ai_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
