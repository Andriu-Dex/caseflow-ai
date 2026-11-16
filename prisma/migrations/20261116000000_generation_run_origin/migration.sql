-- Origin of a construction run: generated, or written by people and imported (ADR-023).
CREATE TYPE "generation_run_origin" AS ENUM ('GENERATED', 'MANUAL');

ALTER TABLE "generation_runs"
    ADD COLUMN "origin" "generation_run_origin" NOT NULL DEFAULT 'GENERATED';
