-- Workflow orchestration (DEC-116, ADR-001).

-- In BUILD_ONLY nobody reviews (ADR-001): every approval there is made by the
-- system, so it defaults to AUTOMATIC. Elsewhere it defaults to HUMAN.
CREATE OR REPLACE FUNCTION "artifact_versions_approval_origin"() RETURNS trigger AS $$
DECLARE
    route text;
BEGIN
    IF NEW."status" <> 'APPROVED' THEN
        NEW."approval_origin" := NULL;
        RETURN NEW;
    END IF;
    SELECT p."workflow_route"::text INTO route FROM projects p WHERE p.id = NEW."project_id";
    IF NEW."approval_origin" IS NULL THEN
        NEW."approval_origin" := CASE WHEN route = 'BUILD_ONLY' THEN 'AUTOMATIC' ELSE 'HUMAN' END;
    END IF;
    IF (NEW."approval_origin" = 'AUTOMATIC' AND route <> 'BUILD_ONLY')
        OR (NEW."approval_origin" = 'HUMAN_BULK' AND route <> 'EXPRESS') THEN
        RAISE EXCEPTION 'approval origin % is not allowed in the % workflow route',
            NEW."approval_origin", route
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- The Design Gate approval carries the same origin (AGENTS.md §16).
ALTER TABLE "design_baselines" ADD COLUMN "approval_origin" "approval_origin" NOT NULL DEFAULT 'HUMAN';

CREATE FUNCTION "design_baselines_approval_origin"() RETURNS trigger AS $$
BEGIN
    IF (SELECT p."workflow_route" FROM projects p WHERE p.id = NEW."project_id") = 'BUILD_ONLY' THEN
        NEW."approval_origin" := 'AUTOMATIC';
    ELSIF NEW."approval_origin" = 'AUTOMATIC' THEN
        RAISE EXCEPTION 'automatic design approval is only allowed in the BUILD_ONLY workflow route'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "design_baselines_approval_origin"
    BEFORE INSERT ON "design_baselines"
    FOR EACH ROW EXECUTE FUNCTION "design_baselines_approval_origin"();

-- One orchestration from the initial prompt, stage by stage (DEC-111).
CREATE TYPE "workflow_run_status" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

CREATE TABLE "workflow_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "prompt" TEXT NOT NULL,
    "status" "workflow_run_status" NOT NULL DEFAULT 'QUEUED',
    "current_stage" TEXT,
    "error_message" TEXT,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),

    CONSTRAINT "workflow_runs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "workflow_runs_prompt_check" CHECK (char_length(btrim("prompt")) BETWEEN 1 AND 4000)
);

-- Completed stages: a retried run skips them instead of generating twice.
CREATE TABLE "workflow_run_stages" (
    "run_id" UUID NOT NULL,
    "stage" TEXT NOT NULL,
    "completed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_run_stages_pkey" PRIMARY KEY ("run_id", "stage")
);

CREATE INDEX "workflow_runs_project_id_created_at_idx" ON "workflow_runs"("project_id", "created_at");
-- At most one orchestration in progress per project.
CREATE UNIQUE INDEX "workflow_runs_one_active_per_project"
    ON "workflow_runs"("project_id") WHERE "status" IN ('QUEUED', 'RUNNING');

ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workflow_run_stages" ADD CONSTRAINT "workflow_run_stages_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "workflow_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
