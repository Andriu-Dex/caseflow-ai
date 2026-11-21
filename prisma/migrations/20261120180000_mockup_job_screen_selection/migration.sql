-- ADR-029: a mockup job may draw only some screens of the blueprint.
ALTER TABLE "mockup_generation_jobs" ADD COLUMN "screen_local_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
