-- CreateEnum
CREATE TYPE "mockup_job_status" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "mockup_generation_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "ui_blueprint_version_id" UUID NOT NULL,
    "existing_mockup_id" UUID,
    "status" "mockup_job_status" NOT NULL DEFAULT 'QUEUED',
    "result_artifact_id" UUID,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mockup_generation_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mockup_generation_jobs_project_id_created_at_idx" ON "mockup_generation_jobs"("project_id", "created_at");

-- AddForeignKey
ALTER TABLE "mockup_generation_jobs" ADD CONSTRAINT "mockup_generation_jobs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
