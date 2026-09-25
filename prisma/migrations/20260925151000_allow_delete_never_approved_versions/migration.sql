-- Explicit, deliberate relaxation of artifact-version immutability, scoped
-- to DELETE only: a Source or an entire Project may now be hard-deleted by
-- the user, but ONLY while nothing in it has ever reached APPROVED status
-- (enforced here at the database level, not just in application code, so
-- the guarantee holds regardless of caller). UPDATE remains fully blocked
-- everywhere it already was — content is still never edited in place;
-- "editing" still means creating a new ArtifactVersion. Once a version (or
-- anything hanging off it) is APPROVED, it remains permanently undeletable,
-- exactly as before.

CREATE OR REPLACE FUNCTION "artifact_versions_enforce_immutability"() RETURNS trigger AS $$
BEGIN
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
$$ LANGUAGE plpgsql;

-- Same relaxation for every content/child table sharing this generic
-- trigger function (project_context_*, requirement_*, use_case_*,
-- data_model_*, diagram_*, source_*, structured_analysis_*, mockup_details).
-- Most of these tables carry artifact_version_id directly; a handful only
-- carry it indirectly (one join away) or under a differently named column
-- — both are resolved explicitly below rather than guessed generically.
CREATE OR REPLACE FUNCTION "project_context_rows_enforce_immutability"() RETURNS trigger AS $$
DECLARE
  row_json JSONB;
  version_id UUID;
  version_status "artifact_version_status";
BEGIN
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
$$ LANGUAGE plpgsql;
