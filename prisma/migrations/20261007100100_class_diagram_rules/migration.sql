-- Separate migration: the enum values added by the previous one cannot be
-- used in the transaction that added them.

ALTER TABLE "diagram_details" DROP CONSTRAINT "diagram_details_format_kind";
ALTER TABLE "diagram_details" ADD CONSTRAINT "diagram_details_format_kind" CHECK (
  ("kind"='ER' AND "source_format"='MERMAID_ER')
  OR ("kind"='USE_CASE' AND "source_format"='PLANTUML')
  OR ("kind"='NAVIGATION_TREE' AND "source_format"='MERMAID_FLOWCHART')
  OR ("kind"='SOFTWARE_ARCHITECTURE' AND "source_format"='PLANTUML_COMPONENT')
  OR ("kind"='SYSTEM_ARCHITECTURE' AND "source_format"='PLANTUML_DEPLOYMENT')
  OR ("kind"='CLASS_DIAGRAM' AND "source_format"='MERMAID_CLASS')
);

CREATE OR REPLACE FUNCTION "diagram_validate_detail"() RETURNS trigger AS $$ BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM artifact_versions av JOIN artifacts a ON a.id=av.artifact_id AND a.project_id=av.project_id
   WHERE av.id=NEW.artifact_version_id AND (
     (NEW.kind='ER' AND a.artifact_type_code='DATA_MODEL')
     OR (NEW.kind='USE_CASE' AND a.artifact_type_code='USE_CASE_DIAGRAM')
     OR (NEW.kind IN ('NAVIGATION_TREE','SOFTWARE_ARCHITECTURE','SYSTEM_ARCHITECTURE','CLASS_DIAGRAM') AND a.artifact_type_code=NEW.kind::text)
   )
 ) THEN RAISE EXCEPTION 'diagram kind does not match artifact type' USING ERRCODE='check_violation'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "diagram_validate_source"() RETURNS trigger AS $$ DECLARE diagram_project UUID; source_project UUID; diagram_kind "diagram_kind"; source_type TEXT; BEGIN
 SELECT av.project_id, dd.kind INTO diagram_project, diagram_kind FROM artifact_versions av JOIN diagram_details dd ON dd.artifact_version_id=av.id WHERE av.id=NEW.diagram_version_id;
 SELECT av.project_id, a.artifact_type_code INTO source_project, source_type FROM artifact_versions av JOIN artifacts a ON a.id=av.artifact_id AND a.project_id=av.project_id WHERE av.id=NEW.source_artifact_version_id;
 IF diagram_project IS NULL OR source_project IS NULL OR diagram_project<>source_project THEN RAISE EXCEPTION 'invalid exact diagram source version' USING ERRCODE='check_violation'; END IF;
 IF diagram_kind='ER' THEN
   IF source_type<>'DATA_MODEL' OR NEW.source_artifact_version_id<>NEW.diagram_version_id THEN RAISE EXCEPTION 'invalid exact diagram source version' USING ERRCODE='check_violation'; END IF;
 ELSIF diagram_kind='USE_CASE' THEN
   IF source_type<>'USE_CASE' OR NOT caseflow_usable_source(NEW.source_artifact_version_id) THEN RAISE EXCEPTION 'invalid exact diagram source version' USING ERRCODE='check_violation'; END IF;
 ELSIF diagram_kind IN ('NAVIGATION_TREE','SOFTWARE_ARCHITECTURE','SYSTEM_ARCHITECTURE','CLASS_DIAGRAM') THEN
   IF source_type<>diagram_kind::text OR NEW.source_artifact_version_id<>NEW.diagram_version_id THEN RAISE EXCEPTION 'invalid exact diagram source version' USING ERRCODE='check_violation'; END IF;
 END IF;
 RETURN NEW; END; $$ LANGUAGE plpgsql;
