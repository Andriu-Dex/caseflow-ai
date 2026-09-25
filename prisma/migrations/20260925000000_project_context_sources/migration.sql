-- Exact provenance: which approved PROJECT_SOURCE versions support a given
-- Project Context version (requirements.md Phase B). Additive only.

CREATE TABLE "project_context_sources" (
  "project_context_version_id" UUID NOT NULL,
  "source_version_id" UUID NOT NULL,
  PRIMARY KEY ("project_context_version_id", "source_version_id")
);

ALTER TABLE "project_context_sources" ADD FOREIGN KEY ("project_context_version_id") REFERENCES "project_context_details"("artifact_version_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "project_context_sources" ADD FOREIGN KEY ("source_version_id") REFERENCES "artifact_versions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE FUNCTION "project_context_validate_source"() RETURNS trigger AS $$
DECLARE
  context_project UUID;
  source_project UUID;
  source_type TEXT;
  source_status "artifact_version_status";
BEGIN
  SELECT av.project_id INTO context_project
    FROM artifact_versions av
    JOIN project_context_details d ON d.artifact_version_id = av.id
    WHERE av.id = NEW.project_context_version_id;
  SELECT av.project_id, a.artifact_type_code, av.status INTO source_project, source_type, source_status
    FROM artifact_versions av
    JOIN artifacts a ON a.id = av.artifact_id AND a.project_id = av.project_id
    WHERE av.id = NEW.source_version_id;
  IF context_project IS NULL OR source_project IS NULL OR context_project <> source_project
     OR source_type <> 'PROJECT_SOURCE' OR source_status <> 'APPROVED' THEN
    RAISE EXCEPTION 'invalid exact approved project source version' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "project_context_validate_source" BEFORE INSERT ON "project_context_sources"
  FOR EACH ROW EXECUTE FUNCTION "project_context_validate_source"();

CREATE TRIGGER "project_context_sources_enforce_immutability" BEFORE UPDATE OR DELETE ON "project_context_sources"
  FOR EACH ROW EXECUTE FUNCTION "project_context_rows_enforce_immutability"();
