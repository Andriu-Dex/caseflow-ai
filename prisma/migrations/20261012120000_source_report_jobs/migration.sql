-- Source reports are generated in the background (DEC-127): in one request
-- when the text fits a provider, otherwise part by part, keeping every part so
-- an interrupted job resumes where it stopped.
-- CreateTable
CREATE TABLE "source_report_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "source_version_id" UUID NOT NULL,
    "status" "source_processing_status" NOT NULL DEFAULT 'QUEUED',
    "part_tokens" INTEGER,
    "total_parts" INTEGER,
    "completed_parts" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "candidate_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "source_report_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_report_job_parts" (
    "job_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "ai_run_id" UUID NOT NULL,

    CONSTRAINT "source_report_job_parts_pkey" PRIMARY KEY ("job_id","position")
);

-- CreateIndex
CREATE UNIQUE INDEX "source_report_jobs_candidate_id_key" ON "source_report_jobs"("candidate_id");

-- CreateIndex
CREATE INDEX "source_report_jobs_project_id_source_version_id_idx" ON "source_report_jobs"("project_id", "source_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "source_report_job_parts_ai_run_id_key" ON "source_report_job_parts"("ai_run_id");

-- AddForeignKey
ALTER TABLE "source_report_jobs" ADD CONSTRAINT "source_report_jobs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_report_jobs" ADD CONSTRAINT "source_report_jobs_source_version_id_project_id_fkey" FOREIGN KEY ("source_version_id", "project_id") REFERENCES "artifact_versions"("id", "project_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_report_jobs" ADD CONSTRAINT "source_report_jobs_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "source_report_candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_report_job_parts" ADD CONSTRAINT "source_report_job_parts_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "source_report_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_report_job_parts" ADD CONSTRAINT "source_report_job_parts_ai_run_id_fkey" FOREIGN KEY ("ai_run_id") REFERENCES "ai_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "source_report_jobs" ADD CONSTRAINT "source_report_jobs_progress_check" CHECK (
  "completed_parts" >= 0 AND ("total_parts" IS NULL OR ("total_parts" > 0 AND "completed_parts" <= "total_parts"))
);
ALTER TABLE "source_report_job_parts" ADD CONSTRAINT "source_report_job_parts_position_check" CHECK ("position" >= 0);
