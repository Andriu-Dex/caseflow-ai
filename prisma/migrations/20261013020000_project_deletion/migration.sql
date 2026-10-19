-- CreateTable
CREATE TABLE "project_deletions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "project_name" TEXT NOT NULL,
    "deleted_by_user_id" UUID NOT NULL,
    "deleted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_deletions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_deletions_workspace_id_deleted_at_idx" ON "project_deletions"("workspace_id", "deleted_at");

-- AddForeignKey
ALTER TABLE "project_deletions" ADD CONSTRAINT "project_deletions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_deletions" ADD CONSTRAINT "project_deletions_deleted_by_user_id_fkey" FOREIGN KEY ("deleted_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- The deletion record is history too.
CREATE FUNCTION "project_deletions_append_only"() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'project_deletions rows are append-only' USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "project_deletions_append_only"
    BEFORE UPDATE OR DELETE ON "project_deletions"
    FOR EACH ROW EXECUTE FUNCTION "project_deletions_append_only"();

-- DEC-134: every guard that protects a project's history from deletion lets
-- through only the transaction that deletes the whole project.
CREATE OR REPLACE FUNCTION public.artifact_versions_enforce_immutability()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- DEC-134: only the transaction that deletes a whole project may remove
    -- this history; it sets caseflow.project_purge for itself (SET LOCAL).
    IF TG_OP = 'DELETE' AND current_setting('caseflow.project_purge', true) = 'on' THEN
        RETURN OLD;
    END IF;
    IF TG_OP = 'DELETE' THEN
        IF OLD."status" = 'APPROVED' THEN
            RAISE EXCEPTION 'approved artifact versions cannot be deleted'
                USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN OLD;
    END IF;

    IF OLD."status" = 'APPROVED' THEN
        RAISE EXCEPTION 'approved artifact versions are immutable'
            USING ERRCODE = 'restrict_violation';
    END IF;

    IF NEW."id" IS DISTINCT FROM OLD."id"
        OR NEW."artifact_id" IS DISTINCT FROM OLD."artifact_id"
        OR NEW."project_id" IS DISTINCT FROM OLD."project_id"
        OR NEW."version_number" IS DISTINCT FROM OLD."version_number"
        OR NEW."title" IS DISTINCT FROM OLD."title"
        OR NEW."origin" IS DISTINCT FROM OLD."origin"
        OR NEW."metadata_auxiliary" IS DISTINCT FROM OLD."metadata_auxiliary"
        OR NEW."created_at" IS DISTINCT FROM OLD."created_at"
    THEN
        RAISE EXCEPTION 'artifact version content is immutable; create a new version instead'
            USING ERRCODE = 'restrict_violation';
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.audit_events_append_only()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- DEC-134: only the transaction that deletes a whole project may remove
    -- this history; it sets caseflow.project_purge for itself (SET LOCAL).
    IF TG_OP = 'DELETE' AND current_setting('caseflow.project_purge', true) = 'on' THEN
        RETURN OLD;
    END IF;
    RAISE EXCEPTION 'audit_events rows are append-only'
        USING ERRCODE = 'restrict_violation';
END;
$function$;

CREATE OR REPLACE FUNCTION public.construction_output_append_only()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- DEC-134: only the transaction that deletes a whole project may remove
    -- this history; it sets caseflow.project_purge for itself (SET LOCAL).
    IF TG_OP = 'DELETE' AND current_setting('caseflow.project_purge', true) = 'on' THEN
        RETURN OLD;
    END IF;
    RAISE EXCEPTION 'generated construction output is append-only' USING ERRCODE = 'restrict_violation';
END;
$function$;

CREATE OR REPLACE FUNCTION public.project_context_rows_enforce_immutability()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  row_json JSONB;
  version_id UUID;
  version_status "artifact_version_status";
BEGIN
    -- DEC-134: only the transaction that deletes a whole project may remove
    -- this history; it sets caseflow.project_purge for itself (SET LOCAL).
    IF TG_OP = 'DELETE' AND current_setting('caseflow.project_purge', true) = 'on' THEN
        RETURN OLD;
    END IF;
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'project context version snapshots are immutable'
            USING ERRCODE = 'restrict_violation';
    END IF;

    row_json := to_jsonb(OLD);

    IF row_json ? 'artifact_version_id' THEN
        version_id := (row_json->>'artifact_version_id')::uuid;
    ELSIF TG_TABLE_NAME = 'project_context_sources' THEN
        version_id := (row_json->>'project_context_version_id')::uuid;
    ELSIF TG_TABLE_NAME = 'source_report_candidates' THEN
        version_id := (row_json->>'source_version_id')::uuid;
    ELSIF TG_TABLE_NAME = 'diagram_source_versions' THEN
        version_id := (row_json->>'diagram_version_id')::uuid;
    ELSIF TG_TABLE_NAME = 'use_case_alternative_flow_steps' THEN
        SELECT artifact_version_id INTO version_id
          FROM use_case_alternative_flows WHERE id = (row_json->>'alternative_flow_id')::uuid;
    ELSIF TG_TABLE_NAME = 'data_model_attributes' THEN
        SELECT artifact_version_id INTO version_id
          FROM data_model_entities WHERE id = (row_json->>'entity_id')::uuid;
    END IF;

    IF version_id IS NOT NULL THEN
        SELECT status INTO version_status FROM artifact_versions WHERE id = version_id;
        IF version_status = 'APPROVED' THEN
            RAISE EXCEPTION 'approved artifact version snapshots are immutable'
                USING ERRCODE = 'restrict_violation';
        END IF;
    END IF;

    RETURN OLD;
END;
$function$;

CREATE OR REPLACE FUNCTION public.dependency_proposals_decided_are_final()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- DEC-134: only the transaction that deletes a whole project may remove
    -- this history; it sets caseflow.project_purge for itself (SET LOCAL).
    IF TG_OP = 'DELETE' AND current_setting('caseflow.project_purge', true) = 'on' THEN
        RETURN OLD;
    END IF;
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'dependency_proposals rows cannot be deleted'
            USING ERRCODE = 'restrict_violation';
    END IF;
    IF OLD."status" <> 'PENDING' THEN
        RAISE EXCEPTION 'decided dependency proposals are final'
            USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.design_baselines_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- DEC-134: only the transaction that deletes a whole project may remove
    -- this history; it sets caseflow.project_purge for itself (SET LOCAL).
    IF TG_OP = 'DELETE' AND current_setting('caseflow.project_purge', true) = 'on' THEN
        RETURN OLD;
    END IF;
    RAISE EXCEPTION 'design baselines are immutable'
        USING ERRCODE = 'restrict_violation';
END;
$function$;

CREATE OR REPLACE FUNCTION public.generation_runs_enforce_lifecycle()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- DEC-134: only the transaction that deletes a whole project may remove
    -- this history; it sets caseflow.project_purge for itself (SET LOCAL).
    IF TG_OP = 'DELETE' AND current_setting('caseflow.project_purge', true) = 'on' THEN
        RETURN OLD;
    END IF;
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
$function$;

CREATE OR REPLACE FUNCTION public.sandbox_runs_enforce_lifecycle()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- DEC-134: only the transaction that deletes a whole project may remove
    -- this history; it sets caseflow.project_purge for itself (SET LOCAL).
    IF TG_OP = 'DELETE' AND current_setting('caseflow.project_purge', true) = 'on' THEN
        RETURN OLD;
    END IF;
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
$function$;

