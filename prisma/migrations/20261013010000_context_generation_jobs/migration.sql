-- CreateTable
CREATE TABLE "context_generation_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "status" "source_processing_status" NOT NULL DEFAULT 'QUEUED',
    "output_chars" INTEGER NOT NULL DEFAULT 0,
    "expected_output_tokens" INTEGER,
    "expected_duration_ms" INTEGER,
    "error_message" TEXT,
    "candidate_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "context_generation_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "context_generation_jobs_candidate_id_key" ON "context_generation_jobs"("candidate_id");

-- CreateIndex
CREATE INDEX "context_generation_jobs_project_id_created_at_idx" ON "context_generation_jobs"("project_id", "created_at");

-- AddForeignKey
ALTER TABLE "context_generation_jobs" ADD CONSTRAINT "context_generation_jobs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "context_generation_jobs" ADD CONSTRAINT "context_generation_jobs_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "project_context_candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

