-- Mockup refinement: a new mockup version generated from the previous one plus a user instruction.
ALTER TABLE "mockup_details" ADD COLUMN "refinement_prompt" TEXT;
ALTER TABLE "mockup_generation_jobs" ADD COLUMN "refinement_prompt" TEXT;
