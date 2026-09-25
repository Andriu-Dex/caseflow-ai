CREATE TYPE "data_model_kind" AS ENUM ('ER');
CREATE TYPE "conceptual_attribute_type" AS ENUM ('STRING','TEXT','INTEGER','DECIMAL','BOOLEAN','DATE','DATETIME','UUID');
CREATE TYPE "data_model_cardinality" AS ENUM ('ONE','ZERO_OR_ONE','ONE_OR_MORE','ZERO_OR_MORE');
CREATE TYPE "diagram_kind" AS ENUM ('ER','USE_CASE');
CREATE TYPE "diagram_source_format" AS ENUM ('MERMAID_ER','PLANTUML');

CREATE TABLE "data_model_generations" ("id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "project_id" UUID NOT NULL, "ai_run_id" UUID NOT NULL, "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE "data_model_generation_sources" ("generation_id" UUID NOT NULL, "artifact_version_id" UUID NOT NULL, "source_id" TEXT NOT NULL, PRIMARY KEY ("generation_id","artifact_version_id"));
CREATE TABLE "data_model_candidates" ("id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "generation_id" UUID NOT NULL, "candidate_id" TEXT NOT NULL, "title" TEXT NOT NULL, "model_kind" "data_model_kind" NOT NULL, "entities" JSONB NOT NULL, "relationships" JSONB NOT NULL, "accepted_artifact_id" UUID);
CREATE TABLE "data_model_details" ("artifact_version_id" UUID PRIMARY KEY, "model_kind" "data_model_kind" NOT NULL, "generation_id" UUID, "generation_candidate_id" UUID, "ai_run_id" UUID);
CREATE TABLE "data_model_entities" ("id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "artifact_version_id" UUID NOT NULL, "local_id" TEXT NOT NULL, "position" INTEGER NOT NULL, "name" TEXT NOT NULL, "description" TEXT);
CREATE TABLE "data_model_attributes" ("id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "entity_id" UUID NOT NULL, "position" INTEGER NOT NULL, "name" TEXT NOT NULL, "type" "conceptual_attribute_type" NOT NULL, "required" BOOLEAN NOT NULL, "primary_key" BOOLEAN NOT NULL, "unique" BOOLEAN NOT NULL, "description" TEXT);
CREATE TABLE "data_model_relationships" ("id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "artifact_version_id" UUID NOT NULL, "position" INTEGER NOT NULL, "source_entity_id" UUID NOT NULL, "target_entity_id" UUID NOT NULL, "name" TEXT, "source_cardinality" "data_model_cardinality" NOT NULL, "target_cardinality" "data_model_cardinality" NOT NULL, "description" TEXT);
CREATE TABLE "diagram_details" ("artifact_version_id" UUID PRIMARY KEY, "kind" "diagram_kind" NOT NULL, "source_format" "diagram_source_format" NOT NULL, "generator_version" TEXT NOT NULL, "source" TEXT NOT NULL, "svg" TEXT NOT NULL);
CREATE TABLE "diagram_source_versions" ("diagram_version_id" UUID NOT NULL, "source_artifact_version_id" UUID NOT NULL, PRIMARY KEY ("diagram_version_id","source_artifact_version_id"));

CREATE UNIQUE INDEX "data_model_generations_ai_run_id_key" ON "data_model_generations"("ai_run_id");
CREATE INDEX "data_model_generations_project_id_created_at_idx" ON "data_model_generations"("project_id","created_at");
CREATE UNIQUE INDEX "data_model_generation_sources_generation_id_source_id_key" ON "data_model_generation_sources"("generation_id","source_id");
CREATE UNIQUE INDEX "data_model_candidates_generation_id_candidate_id_key" ON "data_model_candidates"("generation_id","candidate_id");
CREATE UNIQUE INDEX "data_model_details_generation_candidate_id_key" ON "data_model_details"("generation_candidate_id");
CREATE UNIQUE INDEX "data_model_entities_artifact_version_id_local_id_key" ON "data_model_entities"("artifact_version_id","local_id");
CREATE UNIQUE INDEX "data_model_entities_artifact_version_id_name_key" ON "data_model_entities"("artifact_version_id","name");
CREATE UNIQUE INDEX "data_model_entities_artifact_version_id_position_key" ON "data_model_entities"("artifact_version_id","position");
CREATE UNIQUE INDEX "data_model_entities_id_artifact_version_id_key" ON "data_model_entities"("id","artifact_version_id");
CREATE UNIQUE INDEX "data_model_entities_normalized_name_key" ON "data_model_entities"("artifact_version_id", lower(btrim("name")));
CREATE UNIQUE INDEX "data_model_attributes_entity_id_name_key" ON "data_model_attributes"("entity_id","name");
CREATE UNIQUE INDEX "data_model_attributes_entity_id_position_key" ON "data_model_attributes"("entity_id","position");
CREATE UNIQUE INDEX "data_model_attributes_normalized_name_key" ON "data_model_attributes"("entity_id", lower(btrim("name")));
CREATE UNIQUE INDEX "data_model_attributes_one_primary_key" ON "data_model_attributes"("entity_id") WHERE "primary_key";
CREATE UNIQUE INDEX "data_model_relationships_artifact_version_id_position_key" ON "data_model_relationships"("artifact_version_id","position");

ALTER TABLE "data_model_generations" ADD FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "data_model_generations" ADD FOREIGN KEY ("ai_run_id") REFERENCES "ai_runs"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "data_model_generation_sources" ADD FOREIGN KEY ("generation_id") REFERENCES "data_model_generations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "data_model_generation_sources" ADD FOREIGN KEY ("artifact_version_id") REFERENCES "artifact_versions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "data_model_candidates" ADD FOREIGN KEY ("generation_id") REFERENCES "data_model_generations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "data_model_candidates" ADD FOREIGN KEY ("accepted_artifact_id") REFERENCES "artifacts"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "data_model_details" ADD FOREIGN KEY ("artifact_version_id") REFERENCES "artifact_versions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "data_model_details" ADD FOREIGN KEY ("generation_id") REFERENCES "data_model_generations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "data_model_details" ADD FOREIGN KEY ("generation_candidate_id") REFERENCES "data_model_candidates"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "data_model_details" ADD FOREIGN KEY ("ai_run_id") REFERENCES "ai_runs"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "data_model_entities" ADD FOREIGN KEY ("artifact_version_id") REFERENCES "data_model_details"("artifact_version_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "data_model_attributes" ADD FOREIGN KEY ("entity_id") REFERENCES "data_model_entities"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "data_model_relationships" ADD FOREIGN KEY ("artifact_version_id") REFERENCES "data_model_details"("artifact_version_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "data_model_relationships" ADD FOREIGN KEY ("source_entity_id","artifact_version_id") REFERENCES "data_model_entities"("id","artifact_version_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "data_model_relationships" ADD FOREIGN KEY ("target_entity_id","artifact_version_id") REFERENCES "data_model_entities"("id","artifact_version_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "diagram_details" ADD FOREIGN KEY ("artifact_version_id") REFERENCES "artifact_versions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "diagram_source_versions" ADD FOREIGN KEY ("diagram_version_id") REFERENCES "diagram_details"("artifact_version_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "diagram_source_versions" ADD FOREIGN KEY ("source_artifact_version_id") REFERENCES "artifact_versions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "data_model_candidates" ADD CONSTRAINT "data_model_candidates_nonblank" CHECK (btrim("candidate_id")<>'' AND btrim("title")<>'');
ALTER TABLE "data_model_entities" ADD CONSTRAINT "data_model_entities_values" CHECK ("position">=0 AND btrim("local_id")<>'' AND btrim("name")<>'' AND ("description" IS NULL OR btrim("description")<>''));
ALTER TABLE "data_model_attributes" ADD CONSTRAINT "data_model_attributes_values" CHECK ("position">=0 AND btrim("name")<>'' AND ("description" IS NULL OR btrim("description")<>''));
ALTER TABLE "data_model_relationships" ADD CONSTRAINT "data_model_relationships_values" CHECK ("position">=0 AND ("name" IS NULL OR btrim("name")<>'') AND ("description" IS NULL OR btrim("description")<>''));
ALTER TABLE "diagram_details" ADD CONSTRAINT "diagram_details_values" CHECK (btrim("generator_version")<>'' AND btrim("source")<>'' AND btrim("svg")<>'');
ALTER TABLE "diagram_details" ADD CONSTRAINT "diagram_details_format_kind" CHECK (("kind"='ER' AND "source_format"='MERMAID_ER') OR ("kind"='USE_CASE' AND "source_format"='PLANTUML'));

CREATE FUNCTION "data_model_validate_detail"() RETURNS trigger AS $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM artifact_versions av JOIN artifacts a ON a.id=av.artifact_id AND a.project_id=av.project_id WHERE av.id=NEW.artifact_version_id AND a.artifact_type_code='DATA_MODEL') THEN RAISE EXCEPTION 'data model detail requires DATA_MODEL artifact' USING ERRCODE='check_violation'; END IF;
 IF NEW.generation_candidate_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM data_model_candidates c JOIN data_model_generations g ON g.id=c.generation_id WHERE c.id=NEW.generation_candidate_id AND c.generation_id=NEW.generation_id AND g.ai_run_id=NEW.ai_run_id) THEN RAISE EXCEPTION 'invalid data model provenance' USING ERRCODE='check_violation'; END IF;
 IF NEW.generation_candidate_id IS NULL AND (NEW.generation_id IS NOT NULL OR NEW.ai_run_id IS NOT NULL) THEN RAISE EXCEPTION 'partial data model provenance' USING ERRCODE='check_violation'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "data_model_validate_detail" BEFORE INSERT ON "data_model_details" FOR EACH ROW EXECUTE FUNCTION "data_model_validate_detail"();
CREATE FUNCTION "data_model_validate_source"() RETURNS trigger AS $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM data_model_generations g JOIN artifact_versions av ON av.id=NEW.artifact_version_id AND av.project_id=g.project_id JOIN artifacts a ON a.id=av.artifact_id AND a.project_id=av.project_id WHERE g.id=NEW.generation_id AND av.status='APPROVED' AND a.artifact_type_code IN ('REQUIREMENT','USE_CASE')) THEN RAISE EXCEPTION 'generation source must be approved analysis in same project' USING ERRCODE='check_violation'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "data_model_validate_source" BEFORE INSERT ON "data_model_generation_sources" FOR EACH ROW EXECUTE FUNCTION "data_model_validate_source"();
CREATE FUNCTION "data_model_validate_acceptance"() RETURNS trigger AS $$ BEGIN
 IF NEW.accepted_artifact_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM data_model_generations g JOIN artifacts a ON a.id=NEW.accepted_artifact_id WHERE g.id=NEW.generation_id AND a.project_id=g.project_id AND a.artifact_type_code='DATA_MODEL') THEN RAISE EXCEPTION 'accepted artifact must be DATA_MODEL in generation project' USING ERRCODE='check_violation'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "data_model_validate_acceptance" BEFORE UPDATE OF "accepted_artifact_id" ON "data_model_candidates" FOR EACH ROW EXECUTE FUNCTION "data_model_validate_acceptance"();
CREATE FUNCTION "diagram_validate_detail"() RETURNS trigger AS $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM artifact_versions av JOIN artifacts a ON a.id=av.artifact_id AND a.project_id=av.project_id WHERE av.id=NEW.artifact_version_id AND ((NEW.kind='ER' AND a.artifact_type_code='DATA_MODEL') OR (NEW.kind='USE_CASE' AND a.artifact_type_code='USE_CASE_DIAGRAM'))) THEN RAISE EXCEPTION 'diagram kind does not match artifact type' USING ERRCODE='check_violation'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "diagram_validate_detail" BEFORE INSERT ON "diagram_details" FOR EACH ROW EXECUTE FUNCTION "diagram_validate_detail"();
CREATE FUNCTION "diagram_validate_source"() RETURNS trigger AS $$ DECLARE diagram_project UUID; source_project UUID; diagram_kind "diagram_kind"; source_type TEXT; source_status "artifact_version_status"; BEGIN
 SELECT av.project_id, dd.kind INTO diagram_project, diagram_kind FROM artifact_versions av JOIN diagram_details dd ON dd.artifact_version_id=av.id WHERE av.id=NEW.diagram_version_id;
 SELECT av.project_id, a.artifact_type_code, av.status INTO source_project, source_type, source_status FROM artifact_versions av JOIN artifacts a ON a.id=av.artifact_id AND a.project_id=av.project_id WHERE av.id=NEW.source_artifact_version_id;
 IF diagram_project IS NULL OR source_project IS NULL OR diagram_project<>source_project OR (diagram_kind='ER' AND (source_type<>'DATA_MODEL' OR NEW.source_artifact_version_id<>NEW.diagram_version_id)) OR (diagram_kind='USE_CASE' AND (source_type<>'USE_CASE' OR source_status<>'APPROVED')) THEN RAISE EXCEPTION 'invalid exact diagram source version' USING ERRCODE='check_violation'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "diagram_validate_source" BEFORE INSERT ON "diagram_source_versions" FOR EACH ROW EXECUTE FUNCTION "diagram_validate_source"();

CREATE TRIGGER "data_model_details_enforce_immutability" BEFORE UPDATE OR DELETE ON "data_model_details" FOR EACH ROW EXECUTE FUNCTION "project_context_rows_enforce_immutability"();
CREATE TRIGGER "data_model_entities_enforce_immutability" BEFORE UPDATE OR DELETE ON "data_model_entities" FOR EACH ROW EXECUTE FUNCTION "project_context_rows_enforce_immutability"();
CREATE TRIGGER "data_model_attributes_enforce_immutability" BEFORE UPDATE OR DELETE ON "data_model_attributes" FOR EACH ROW EXECUTE FUNCTION "project_context_rows_enforce_immutability"();
CREATE TRIGGER "data_model_relationships_enforce_immutability" BEFORE UPDATE OR DELETE ON "data_model_relationships" FOR EACH ROW EXECUTE FUNCTION "project_context_rows_enforce_immutability"();
CREATE TRIGGER "diagram_details_enforce_immutability" BEFORE UPDATE OR DELETE ON "diagram_details" FOR EACH ROW EXECUTE FUNCTION "project_context_rows_enforce_immutability"();
CREATE TRIGGER "diagram_source_versions_enforce_immutability" BEFORE UPDATE OR DELETE ON "diagram_source_versions" FOR EACH ROW EXECUTE FUNCTION "project_context_rows_enforce_immutability"();
