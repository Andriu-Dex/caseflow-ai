-- DEC-144: an implementation plan generated in batches starts from a design baseline.
ALTER TABLE "structured_generation_jobs" ADD COLUMN "design_baseline_id" UUID;
ALTER TABLE "structured_generation_jobs" ADD CONSTRAINT "structured_generation_jobs_design_baseline_id_fkey" FOREIGN KEY ("design_baseline_id") REFERENCES "design_baselines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
