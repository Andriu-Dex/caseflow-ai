-- DEC-146: a Stitch mockup is generated screen by screen, with a checkpoint
-- per screen, so a long run that stops resumes with the screens still missing.
ALTER TABLE "mockup_generation_jobs"
  ADD COLUMN "total_screens" INTEGER NOT NULL DEFAULT 0 CHECK (total_screens >= 0),
  ADD COLUMN "completed_screens" INTEGER NOT NULL DEFAULT 0 CHECK (completed_screens >= 0),
  ADD COLUMN "stitch_project_id" TEXT;
CREATE TABLE "mockup_generation_parts" (
  "job_id" UUID NOT NULL,
  "screen_local_id" TEXT NOT NULL,
  "screen_name" TEXT NOT NULL,
  "image_storage_key" TEXT NOT NULL,
  "image_content_type" TEXT NOT NULL,
  "html_storage_key" TEXT NOT NULL,
  "stitch_project_id" TEXT,
  "stitch_screen_id" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mockup_generation_parts_pkey" PRIMARY KEY ("job_id", "screen_local_id"),
  CONSTRAINT "mockup_generation_parts_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "mockup_generation_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
