-- Single-screen mockup editing: keep the Stitch identity of each generated screen
-- and let a generation job target one screen.
ALTER TABLE "mockup_screen_details" ADD COLUMN "stitch_project_id" TEXT;
ALTER TABLE "mockup_screen_details" ADD COLUMN "stitch_screen_id" TEXT;
ALTER TABLE "mockup_screen_details" ADD COLUMN "refinement_prompt" TEXT;
ALTER TABLE "mockup_generation_jobs" ADD COLUMN "screen_local_id" TEXT;
