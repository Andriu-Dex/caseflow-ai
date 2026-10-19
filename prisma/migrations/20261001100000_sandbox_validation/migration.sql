-- Sandbox validation, bounded auto-repair and immutable generated-project
-- snapshots (spec §172-§177, §198).

-- CreateEnum
CREATE TYPE "sandbox_run_status" AS ENUM ('QUEUED', 'RUNNING', 'READY', 'FAILED', 'VALIDATION_FAILED', 'ERROR');

-- CreateEnum
CREATE TYPE "validation_stage" AS ENUM ('INSTALL', 'LINT', 'TYPECHECK', 'TEST', 'BUILD', 'STRUCTURE', 'TRACEABILITY');

-- CreateEnum
CREATE TYPE "auto_repair_status" AS ENUM ('PATCHED', 'NO_PATCH', 'REJECTED');

-- CreateTable
CREATE TABLE "sandbox_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "generation_run_id" UUID NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "status" "sandbox_run_status" NOT NULL DEFAULT 'QUEUED',
    "current_stage" "validation_stage",
    "failed_stage" "validation_stage",
    "error_message" TEXT,
    "lockfile" TEXT,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),

    CONSTRAINT "sandbox_runs_pkey" PRIMARY KEY ("id"),
    -- First attempt plus at most MAX_AUTO_REPAIR_ROUNDS = 3 repaired ones.
    CONSTRAINT "sandbox_runs_attempt_number_check" CHECK ("attempt_number" BETWEEN 1 AND 4)
);

-- CreateTable
CREATE TABLE "sandbox_stage_results" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sandbox_run_id" UUID NOT NULL,
    "stage" "validation_stage" NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "exit_code" INTEGER,
    "timed_out" BOOLEAN NOT NULL DEFAULT false,
    "duration_ms" INTEGER NOT NULL,
    "output" TEXT NOT NULL,

    CONSTRAINT "sandbox_stage_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auto_repair_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "generation_run_id" UUID NOT NULL,
    "sandbox_run_id" UUID NOT NULL,
    "round_number" INTEGER NOT NULL,
    "failed_stage" "validation_stage" NOT NULL,
    "status" "auto_repair_status" NOT NULL,
    "explanation" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auto_repair_attempts_pkey" PRIMARY KEY ("id"),
    -- MAX_AUTO_REPAIR_ROUNDS = 3 (DEC-103), enforced by the database itself.
    CONSTRAINT "auto_repair_attempts_round_number_check" CHECK ("round_number" BETWEEN 1 AND 3)
);

-- CreateTable
CREATE TABLE "repair_patches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "auto_repair_attempt_id" UUID NOT NULL,
    "path" TEXT NOT NULL,
    "previous_sha256" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,

    CONSTRAINT "repair_patches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repair_findings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "auto_repair_attempt_id" UUID NOT NULL,
    "message" TEXT NOT NULL,
    "related_artifact_version_id" UUID,

    CONSTRAINT "repair_findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generated_project_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "generation_run_id" UUID NOT NULL,
    "sandbox_run_id" UUID NOT NULL,
    "target_template_identifier" TEXT NOT NULL,
    "target_template_version" INTEGER NOT NULL,
    "generation_plan_version_id" UUID,
    "design_baseline_id" UUID NOT NULL,
    "implementation_plan_version_id" UUID NOT NULL,
    "file_count" INTEGER NOT NULL,
    "manifest_hash" TEXT NOT NULL,
    "archive_storage_key" TEXT NOT NULL,
    "archive_sha256" TEXT NOT NULL,
    "archive_size" INTEGER NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "generated_project_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sandbox_runs_generation_run_id_created_at_idx" ON "sandbox_runs"("generation_run_id", "created_at");

-- One validation in progress per generation run.
CREATE UNIQUE INDEX "sandbox_runs_one_active_per_generation_run" ON "sandbox_runs"("generation_run_id") WHERE "status" IN ('QUEUED', 'RUNNING');

-- CreateIndex
CREATE UNIQUE INDEX "sandbox_stage_results_sandbox_run_id_stage_key" ON "sandbox_stage_results"("sandbox_run_id", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "auto_repair_attempts_sandbox_run_id_key" ON "auto_repair_attempts"("sandbox_run_id");

-- CreateIndex
CREATE UNIQUE INDEX "auto_repair_attempts_generation_run_id_round_number_key" ON "auto_repair_attempts"("generation_run_id", "round_number");

-- CreateIndex
CREATE UNIQUE INDEX "repair_patches_auto_repair_attempt_id_path_key" ON "repair_patches"("auto_repair_attempt_id", "path");

-- CreateIndex
CREATE INDEX "repair_findings_auto_repair_attempt_id_idx" ON "repair_findings"("auto_repair_attempt_id");

-- CreateIndex
CREATE UNIQUE INDEX "generated_project_snapshots_generation_run_id_key" ON "generated_project_snapshots"("generation_run_id");

-- CreateIndex
CREATE UNIQUE INDEX "generated_project_snapshots_sandbox_run_id_key" ON "generated_project_snapshots"("sandbox_run_id");

-- CreateIndex
CREATE INDEX "generated_project_snapshots_project_id_created_at_idx" ON "generated_project_snapshots"("project_id", "created_at");

-- AddForeignKey
ALTER TABLE "sandbox_runs" ADD CONSTRAINT "sandbox_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sandbox_runs" ADD CONSTRAINT "sandbox_runs_generation_run_id_fkey" FOREIGN KEY ("generation_run_id") REFERENCES "generation_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sandbox_runs" ADD CONSTRAINT "sandbox_runs_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sandbox_stage_results" ADD CONSTRAINT "sandbox_stage_results_sandbox_run_id_fkey" FOREIGN KEY ("sandbox_run_id") REFERENCES "sandbox_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auto_repair_attempts" ADD CONSTRAINT "auto_repair_attempts_generation_run_id_fkey" FOREIGN KEY ("generation_run_id") REFERENCES "generation_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auto_repair_attempts" ADD CONSTRAINT "auto_repair_attempts_sandbox_run_id_fkey" FOREIGN KEY ("sandbox_run_id") REFERENCES "sandbox_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repair_patches" ADD CONSTRAINT "repair_patches_auto_repair_attempt_id_fkey" FOREIGN KEY ("auto_repair_attempt_id") REFERENCES "auto_repair_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repair_findings" ADD CONSTRAINT "repair_findings_auto_repair_attempt_id_fkey" FOREIGN KEY ("auto_repair_attempt_id") REFERENCES "auto_repair_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repair_findings" ADD CONSTRAINT "repair_findings_related_artifact_version_id_fkey" FOREIGN KEY ("related_artifact_version_id") REFERENCES "artifact_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_project_snapshots" ADD CONSTRAINT "generated_project_snapshots_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_project_snapshots" ADD CONSTRAINT "generated_project_snapshots_generation_run_id_fkey" FOREIGN KEY ("generation_run_id") REFERENCES "generation_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_project_snapshots" ADD CONSTRAINT "generated_project_snapshots_sandbox_run_id_fkey" FOREIGN KEY ("sandbox_run_id") REFERENCES "sandbox_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_project_snapshots" ADD CONSTRAINT "generated_project_snapshots_generation_plan_version_id_fkey" FOREIGN KEY ("generation_plan_version_id") REFERENCES "artifact_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_project_snapshots" ADD CONSTRAINT "generated_project_snapshots_design_baseline_id_fkey" FOREIGN KEY ("design_baseline_id") REFERENCES "design_baselines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_project_snapshots" ADD CONSTRAINT "generated_project_snapshots_implementation_plan_version_id_fkey" FOREIGN KEY ("implementation_plan_version_id") REFERENCES "artifact_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_project_snapshots" ADD CONSTRAINT "generated_project_snapshots_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Integrity rules Prisma cannot express --------------------------------------

-- A sandbox run validates a GENERATED run of its own project.
CREATE FUNCTION "sandbox_runs_validate"() RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM generation_runs r
        WHERE r.id = NEW.generation_run_id AND r.project_id = NEW.project_id AND r.status = 'GENERATED'
    ) THEN
        RAISE EXCEPTION 'a sandbox run requires a generated run of the same project'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "sandbox_runs_validate"
    BEFORE INSERT ON "sandbox_runs"
    FOR EACH ROW EXECUTE FUNCTION "sandbox_runs_validate"();

-- QUEUED -> RUNNING -> READY | FAILED | VALIDATION_FAILED | ERROR; a finished
-- run is history and its inputs never change.
CREATE FUNCTION "sandbox_runs_enforce_lifecycle"() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'sandbox runs cannot be deleted' USING ERRCODE = 'restrict_violation';
    END IF;
    IF OLD.status NOT IN ('QUEUED', 'RUNNING') THEN
        RAISE EXCEPTION 'finished sandbox runs are immutable' USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.project_id <> OLD.project_id
       OR NEW.generation_run_id <> OLD.generation_run_id
       OR NEW.attempt_number <> OLD.attempt_number
       OR NEW.created_by_user_id <> OLD.created_by_user_id THEN
        RAISE EXCEPTION 'sandbox run inputs are immutable' USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "sandbox_runs_enforce_lifecycle"
    BEFORE UPDATE OR DELETE ON "sandbox_runs"
    FOR EACH ROW EXECUTE FUNCTION "sandbox_runs_enforce_lifecycle"();

-- Validation evidence, repairs and snapshots are append-only history.
CREATE TRIGGER "sandbox_stage_results_append_only"
    BEFORE UPDATE OR DELETE ON "sandbox_stage_results"
    FOR EACH ROW EXECUTE FUNCTION "construction_output_append_only"();

CREATE TRIGGER "auto_repair_attempts_append_only"
    BEFORE UPDATE OR DELETE ON "auto_repair_attempts"
    FOR EACH ROW EXECUTE FUNCTION "construction_output_append_only"();

CREATE TRIGGER "repair_patches_append_only"
    BEFORE UPDATE OR DELETE ON "repair_patches"
    FOR EACH ROW EXECUTE FUNCTION "construction_output_append_only"();

CREATE TRIGGER "repair_findings_append_only"
    BEFORE UPDATE OR DELETE ON "repair_findings"
    FOR EACH ROW EXECUTE FUNCTION "construction_output_append_only"();

CREATE TRIGGER "generated_project_snapshots_append_only"
    BEFORE UPDATE OR DELETE ON "generated_project_snapshots"
    FOR EACH ROW EXECUTE FUNCTION "construction_output_append_only"();

-- A repair round belongs to a failed attempt of the same generation run.
CREATE FUNCTION "auto_repair_attempts_validate"() RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM sandbox_runs s
        WHERE s.id = NEW.sandbox_run_id AND s.generation_run_id = NEW.generation_run_id
          AND s.attempt_number = NEW.round_number
    ) THEN
        RAISE EXCEPTION 'a repair round follows the failed attempt with the same number of its generation run'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "auto_repair_attempts_validate"
    BEFORE INSERT ON "auto_repair_attempts"
    FOR EACH ROW EXECUTE FUNCTION "auto_repair_attempts_validate"();

-- A finding may only point at a version of the same project.
CREATE FUNCTION "repair_findings_validate"() RETURNS trigger AS $$
BEGIN
    IF NEW.related_artifact_version_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM auto_repair_attempts a
        JOIN generation_runs r ON r.id = a.generation_run_id
        JOIN artifact_versions av ON av.id = NEW.related_artifact_version_id AND av.project_id = r.project_id
        WHERE a.id = NEW.auto_repair_attempt_id
    ) THEN
        RAISE EXCEPTION 'findings must reference a version of the run''s project' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "repair_findings_validate"
    BEFORE INSERT ON "repair_findings"
    FOR EACH ROW EXECUTE FUNCTION "repair_findings_validate"();

-- A snapshot is only formalized from a READY attempt of the same generation
-- run and project, and copies that run's exact inputs (never READY otherwise).
CREATE FUNCTION "generated_project_snapshots_validate"() RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM sandbox_runs s
        JOIN generation_runs r ON r.id = s.generation_run_id
        WHERE s.id = NEW.sandbox_run_id
          AND s.status = 'READY'
          AND r.id = NEW.generation_run_id
          AND r.project_id = NEW.project_id
          AND r.implementation_plan_version_id = NEW.implementation_plan_version_id
          AND r.design_baseline_id = NEW.design_baseline_id
          AND r.target_template_identifier = NEW.target_template_identifier
          AND r.target_template_version = NEW.target_template_version
    ) THEN
        RAISE EXCEPTION 'a snapshot requires a READY sandbox run of the same generation run'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "generated_project_snapshots_validate"
    BEFORE INSERT ON "generated_project_snapshots"
    FOR EACH ROW EXECUTE FUNCTION "generated_project_snapshots_validate"();
