-- Provisional sources (DEC-119, ADR-004): the provenance triggers that
-- required APPROVED sources also accept a draft in an EXPRESS project. The
-- approval trigger (artifact_versions_approved_provenance) keeps anything from
-- being approved before its sources.
CREATE FUNCTION "caseflow_usable_source"(version_id UUID) RETURNS boolean AS $$
    SELECT av.status = 'APPROVED'
        OR (p.workflow_route = 'EXPRESS' AND av.status IN ('DRAFT', 'GENERATED', 'IN_REVIEW'))
    FROM artifact_versions av
    JOIN projects p ON p.id = av.project_id
    WHERE av.id = version_id;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION "use_case_validate_generation_source"() RETURNS trigger AS $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM use_case_generations g JOIN artifact_versions av ON av.id=NEW.requirement_version_id AND av.project_id=g.project_id JOIN artifacts a ON a.id=av.artifact_id AND a.project_id=av.project_id WHERE g.id=NEW.generation_id AND a.artifact_type_code='REQUIREMENT' AND caseflow_usable_source(av.id)) THEN RAISE EXCEPTION 'generation source must be an approved requirement version in the same project' USING ERRCODE='check_violation'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "data_model_validate_source"() RETURNS trigger AS $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM data_model_generations g JOIN artifact_versions av ON av.id=NEW.artifact_version_id AND av.project_id=g.project_id JOIN artifacts a ON a.id=av.artifact_id AND a.project_id=av.project_id WHERE g.id=NEW.generation_id AND caseflow_usable_source(av.id) AND a.artifact_type_code IN ('REQUIREMENT','USE_CASE')) THEN RAISE EXCEPTION 'generation source must be approved analysis in same project' USING ERRCODE='check_violation'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "diagram_validate_source"() RETURNS trigger AS $$ DECLARE diagram_project UUID; source_project UUID; diagram_kind "diagram_kind"; source_type TEXT; BEGIN
 SELECT av.project_id, dd.kind INTO diagram_project, diagram_kind FROM artifact_versions av JOIN diagram_details dd ON dd.artifact_version_id=av.id WHERE av.id=NEW.diagram_version_id;
 SELECT av.project_id, a.artifact_type_code INTO source_project, source_type FROM artifact_versions av JOIN artifacts a ON a.id=av.artifact_id AND a.project_id=av.project_id WHERE av.id=NEW.source_artifact_version_id;
 IF diagram_project IS NULL OR source_project IS NULL OR diagram_project<>source_project THEN RAISE EXCEPTION 'invalid exact diagram source version' USING ERRCODE='check_violation'; END IF;
 IF diagram_kind='ER' THEN
   IF source_type<>'DATA_MODEL' OR NEW.source_artifact_version_id<>NEW.diagram_version_id THEN RAISE EXCEPTION 'invalid exact diagram source version' USING ERRCODE='check_violation'; END IF;
 ELSIF diagram_kind='USE_CASE' THEN
   IF source_type<>'USE_CASE' OR NOT caseflow_usable_source(NEW.source_artifact_version_id) THEN RAISE EXCEPTION 'invalid exact diagram source version' USING ERRCODE='check_violation'; END IF;
 ELSIF diagram_kind IN ('NAVIGATION_TREE','SOFTWARE_ARCHITECTURE','SYSTEM_ARCHITECTURE') THEN
   IF source_type<>diagram_kind::text OR NEW.source_artifact_version_id<>NEW.diagram_version_id THEN RAISE EXCEPTION 'invalid exact diagram source version' USING ERRCODE='check_violation'; END IF;
 END IF;
 RETURN NEW; END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "structured_analysis_validate_source"() RETURNS trigger AS $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM structured_analysis_generations g JOIN artifact_versions av ON av.id=NEW.artifact_version_id AND av.project_id=g.project_id WHERE g.id=NEW.generation_id AND caseflow_usable_source(av.id)) THEN RAISE EXCEPTION 'generation source must be an approved version in the same project' USING ERRCODE='check_violation'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "mockup_validate_detail"() RETURNS trigger AS $$ DECLARE mockup_project UUID; source_project UUID; source_type TEXT; BEGIN
 SELECT av.project_id INTO mockup_project FROM artifact_versions av JOIN artifacts a ON a.id=av.artifact_id AND a.project_id=av.project_id WHERE av.id=NEW.artifact_version_id AND a.artifact_type_code='MOCKUP';
 SELECT av.project_id, a.artifact_type_code INTO source_project, source_type FROM artifact_versions av JOIN artifacts a ON a.id=av.artifact_id AND a.project_id=av.project_id WHERE av.id=NEW.ui_blueprint_version_id;
 IF mockup_project IS NULL OR source_project IS NULL OR mockup_project<>source_project OR source_type<>'UI_BLUEPRINT' OR NOT caseflow_usable_source(NEW.ui_blueprint_version_id) THEN RAISE EXCEPTION 'mockup requires a MOCKUP artifact and an exact approved UI_BLUEPRINT version in the same project' USING ERRCODE='check_violation'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "project_context_validate_source"() RETURNS trigger AS $$
DECLARE
  context_project UUID;
  source_project UUID;
  source_type TEXT;
BEGIN
  SELECT av.project_id INTO context_project
    FROM artifact_versions av
    JOIN project_context_details d ON d.artifact_version_id = av.id
    WHERE av.id = NEW.project_context_version_id;
  SELECT av.project_id, a.artifact_type_code INTO source_project, source_type
    FROM artifact_versions av
    JOIN artifacts a ON a.id = av.artifact_id AND a.project_id = av.project_id
    WHERE av.id = NEW.source_version_id;
  IF context_project IS NULL OR source_project IS NULL OR context_project <> source_project
     OR source_type <> 'PROJECT_SOURCE' OR NOT caseflow_usable_source(NEW.source_version_id) THEN
    RAISE EXCEPTION 'invalid exact approved project source version' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
