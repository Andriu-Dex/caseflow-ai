-- Provisional sources in the EXPRESS route (DEC-119, ADR-004): generation may
-- start from drafts there, so approval must never get ahead of provenance. In
-- every route, a version can only become APPROVED once every version it was
-- generated from is APPROVED. Elsewhere sources are already approved, so this
-- only ever fires for EXPRESS drafts.
CREATE FUNCTION "artifact_versions_approved_provenance"() RETURNS trigger AS $$
BEGIN
    IF NEW."status" = 'APPROVED' AND (TG_OP = 'INSERT' OR OLD."status" <> 'APPROVED') AND EXISTS (
        SELECT 1
        FROM (
            SELECT pcs.source_version_id AS id FROM project_context_sources pcs
                WHERE pcs.project_context_version_id = NEW.id
            UNION ALL
            SELECT rd.source_context_version_id FROM requirement_details rd
                WHERE rd.artifact_version_id = NEW.id AND rd.source_context_version_id IS NOT NULL
            UNION ALL
            SELECT ugs.requirement_version_id FROM use_case_details ud
                JOIN use_case_generation_sources ugs ON ugs.generation_id = ud.generation_id
                WHERE ud.artifact_version_id = NEW.id
            UNION ALL
            SELECT dgs.artifact_version_id FROM data_model_details dd
                JOIN data_model_generation_sources dgs ON dgs.generation_id = dd.generation_id
                WHERE dd.artifact_version_id = NEW.id
            UNION ALL
            SELECT sgs.artifact_version_id FROM structured_analysis_details sd
                JOIN structured_analysis_generation_sources sgs ON sgs.generation_id = sd.generation_id
                WHERE sd.artifact_version_id = NEW.id
            UNION ALL
            SELECT md.ui_blueprint_version_id FROM mockup_details md
                WHERE md.artifact_version_id = NEW.id
            UNION ALL
            SELECT md.design_theme_version_id FROM mockup_details md
                WHERE md.artifact_version_id = NEW.id AND md.design_theme_version_id IS NOT NULL
        ) provenance
        JOIN artifact_versions source ON source.id = provenance.id
        WHERE source.status <> 'APPROVED'
    ) THEN
        RAISE EXCEPTION 'a version cannot be approved before the versions it was generated from'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "artifact_versions_approved_provenance"
    BEFORE INSERT OR UPDATE ON "artifact_versions"
    FOR EACH ROW EXECUTE FUNCTION "artifact_versions_approved_provenance"();
