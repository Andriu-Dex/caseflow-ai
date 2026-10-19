-- Code generation runs (spec §197): generated files and construction traceability.

-- CreateEnum
CREATE TYPE "generation_run_status" AS ENUM ('QUEUED', 'GENERATING', 'GENERATED', 'FAILED');

-- CreateEnum
CREATE TYPE "generated_file_origin" AS ENUM ('TEMPLATE', 'DETERMINISTIC', 'AI_ASSISTED');

-- CreateEnum
CREATE TYPE "generated_file_kind" AS ENUM ('SOURCE', 'TEST', 'CONFIG', 'DOCUMENTATION');

-- CreateEnum
CREATE TYPE "code_trace_link_type" AS ENUM ('IMPLEMENTS', 'TESTS', 'CONFIGURES');

-- CreateTable
CREATE TABLE "generation_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "implementation_plan_version_id" UUID NOT NULL,
    "design_baseline_id" UUID NOT NULL,
    "target_template_identifier" TEXT NOT NULL,
    "target_template_version" INTEGER NOT NULL,
    "status" "generation_run_status" NOT NULL DEFAULT 'QUEUED',
    "error_message" TEXT,
    "warnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),

    CONSTRAINT "generation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generated_files" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "generation_run_id" UUID NOT NULL,
    "path" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "origin" "generated_file_origin" NOT NULL,
    "kind" "generated_file_kind" NOT NULL,

    CONSTRAINT "generated_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "code_trace_links" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "generated_file_id" UUID NOT NULL,
    "source_artifact_version_id" UUID NOT NULL,
    "plan_element" TEXT NOT NULL,
    "link_type" "code_trace_link_type" NOT NULL,

    CONSTRAINT "code_trace_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "generation_runs_project_id_created_at_idx" ON "generation_runs"("project_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "generated_files_generation_run_id_path_key" ON "generated_files"("generation_run_id", "path");

-- CreateIndex
CREATE INDEX "code_trace_links_source_artifact_version_id_idx" ON "code_trace_links"("source_artifact_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "code_trace_links_generated_file_id_source_artifact_version__key" ON "code_trace_links"("generated_file_id", "source_artifact_version_id", "plan_element");

-- AddForeignKey
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_implementation_plan_version_id_fkey" FOREIGN KEY ("implementation_plan_version_id") REFERENCES "artifact_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_design_baseline_id_fkey" FOREIGN KEY ("design_baseline_id") REFERENCES "design_baselines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_files" ADD CONSTRAINT "generated_files_generation_run_id_fkey" FOREIGN KEY ("generation_run_id") REFERENCES "generation_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "code_trace_links" ADD CONSTRAINT "code_trace_links_generated_file_id_fkey" FOREIGN KEY ("generated_file_id") REFERENCES "generated_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "code_trace_links" ADD CONSTRAINT "code_trace_links_source_artifact_version_id_fkey" FOREIGN KEY ("source_artifact_version_id") REFERENCES "artifact_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Integrity rules Prisma cannot express --------------------------------------

-- A run is built from an APPROVED Implementation Plan version and an approved
-- Design Baseline, both of the run's own project.
CREATE FUNCTION "generation_runs_validate"() RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM artifact_versions av
        JOIN artifacts a ON a.id = av.artifact_id AND a.project_id = av.project_id
        WHERE av.id = NEW.implementation_plan_version_id
          AND av.project_id = NEW.project_id
          AND av.status = 'APPROVED'
          AND a.artifact_type_code = 'IMPLEMENTATION_PLAN'
    ) THEN
        RAISE EXCEPTION 'a generation run requires an approved implementation plan of the same project'
            USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM design_baselines b WHERE b.id = NEW.design_baseline_id AND b.project_id = NEW.project_id
    ) THEN
        RAISE EXCEPTION 'a generation run requires a design baseline of the same project'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "generation_runs_validate"
    BEFORE INSERT ON "generation_runs"
    FOR EACH ROW EXECUTE FUNCTION "generation_runs_validate"();

-- Status only moves forward; a finished run (GENERATED/FAILED) is history.
CREATE FUNCTION "generation_runs_enforce_lifecycle"() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'generation runs cannot be deleted' USING ERRCODE = 'restrict_violation';
    END IF;
    IF OLD.status IN ('GENERATED', 'FAILED') THEN
        RAISE EXCEPTION 'finished generation runs are immutable' USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.project_id <> OLD.project_id
       OR NEW.implementation_plan_version_id <> OLD.implementation_plan_version_id
       OR NEW.design_baseline_id <> OLD.design_baseline_id
       OR NEW.target_template_identifier <> OLD.target_template_identifier
       OR NEW.target_template_version <> OLD.target_template_version
       OR NEW.created_by_user_id <> OLD.created_by_user_id THEN
        RAISE EXCEPTION 'generation run inputs are immutable' USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "generation_runs_enforce_lifecycle"
    BEFORE UPDATE OR DELETE ON "generation_runs"
    FOR EACH ROW EXECUTE FUNCTION "generation_runs_enforce_lifecycle"();

-- Generated files and their trace links are append-only.
CREATE FUNCTION "construction_output_append_only"() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'generated construction output is append-only' USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "generated_files_append_only"
    BEFORE UPDATE OR DELETE ON "generated_files"
    FOR EACH ROW EXECUTE FUNCTION "construction_output_append_only"();

CREATE TRIGGER "code_trace_links_append_only"
    BEFORE UPDATE OR DELETE ON "code_trace_links"
    FOR EACH ROW EXECUTE FUNCTION "construction_output_append_only"();

-- Files may only be added while the run is generating.
CREATE FUNCTION "generated_files_validate_run"() RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM generation_runs r WHERE r.id = NEW.generation_run_id AND r.status = 'GENERATING') THEN
        RAISE EXCEPTION 'files can only be added to a generating run' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "generated_files_validate_run"
    BEFORE INSERT ON "generated_files"
    FOR EACH ROW EXECUTE FUNCTION "generated_files_validate_run"();

-- A trace link points at a version of the same project as the run.
CREATE FUNCTION "code_trace_links_validate"() RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM generated_files f
        JOIN generation_runs r ON r.id = f.generation_run_id
        JOIN artifact_versions av ON av.id = NEW.source_artifact_version_id AND av.project_id = r.project_id
        WHERE f.id = NEW.generated_file_id
    ) THEN
        RAISE EXCEPTION 'trace links must reference a version of the run''s project' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "code_trace_links_validate"
    BEFORE INSERT ON "code_trace_links"
    FOR EACH ROW EXECUTE FUNCTION "code_trace_links_validate"();
