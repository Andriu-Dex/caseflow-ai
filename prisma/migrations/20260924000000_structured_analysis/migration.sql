-- First Deliverable: Navigation Tree, Software Architecture, System
-- Architecture and UI Blueprint. One shared table family, discriminated by
-- `kind`, mirrors the existing DiagramDetail pattern; content shape per kind
-- is validated by packages/contracts (Zod), not by the database.

-- Additive correction: SOFTWARE_ARCHITECTURE and SYSTEM_ARCHITECTURE were
-- seeded with the same default code prefix in the 1A migration, which would
-- make ARQ-### codes ambiguous between the two artifact types within one
-- project. Historical rows are unaffected (no SYSTEM_ARCHITECTURE artifacts
-- exist yet); only the reference-table default changes going forward.
UPDATE "artifact_types" SET "default_code_prefix" = 'SARQ' WHERE "code" = 'SYSTEM_ARCHITECTURE';

CREATE TYPE "structured_analysis_kind" AS ENUM ('NAVIGATION_TREE','SOFTWARE_ARCHITECTURE','SYSTEM_ARCHITECTURE','UI_BLUEPRINT');

CREATE TABLE "structured_analysis_generations" ("id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "project_id" UUID NOT NULL, "kind" "structured_analysis_kind" NOT NULL, "ai_run_id" UUID NOT NULL, "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE "structured_analysis_generation_sources" ("generation_id" UUID NOT NULL, "artifact_version_id" UUID NOT NULL, "source_id" TEXT NOT NULL, PRIMARY KEY ("generation_id","artifact_version_id"));
CREATE TABLE "structured_analysis_candidates" ("id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "generation_id" UUID NOT NULL, "candidate_id" TEXT NOT NULL, "title" TEXT NOT NULL, "content" JSONB NOT NULL, "accepted_artifact_id" UUID);
CREATE TABLE "structured_analysis_details" ("artifact_version_id" UUID PRIMARY KEY, "kind" "structured_analysis_kind" NOT NULL, "content" JSONB NOT NULL, "generation_id" UUID, "generation_candidate_id" UUID, "ai_run_id" UUID);
CREATE TABLE "mockup_details" ("artifact_version_id" UUID PRIMARY KEY, "ui_blueprint_version_id" UUID NOT NULL, "generator_version" TEXT NOT NULL, "svg" TEXT NOT NULL);

CREATE UNIQUE INDEX "structured_analysis_generations_ai_run_id_key" ON "structured_analysis_generations"("ai_run_id");
CREATE INDEX "structured_analysis_generations_project_kind_created_idx" ON "structured_analysis_generations"("project_id","kind","created_at");
CREATE UNIQUE INDEX "structured_analysis_generation_sources_source_key" ON "structured_analysis_generation_sources"("generation_id","source_id");
CREATE UNIQUE INDEX "structured_analysis_candidates_generation_candidate_key" ON "structured_analysis_candidates"("generation_id","candidate_id");
CREATE UNIQUE INDEX "structured_analysis_details_generation_candidate_id_key" ON "structured_analysis_details"("generation_candidate_id");

ALTER TABLE "structured_analysis_generations" ADD FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "structured_analysis_generations" ADD FOREIGN KEY ("ai_run_id") REFERENCES "ai_runs"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "structured_analysis_generation_sources" ADD FOREIGN KEY ("generation_id") REFERENCES "structured_analysis_generations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "structured_analysis_generation_sources" ADD FOREIGN KEY ("artifact_version_id") REFERENCES "artifact_versions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "structured_analysis_candidates" ADD FOREIGN KEY ("generation_id") REFERENCES "structured_analysis_generations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "structured_analysis_candidates" ADD FOREIGN KEY ("accepted_artifact_id") REFERENCES "artifacts"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "structured_analysis_details" ADD FOREIGN KEY ("artifact_version_id") REFERENCES "artifact_versions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "structured_analysis_details" ADD FOREIGN KEY ("generation_id") REFERENCES "structured_analysis_generations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "structured_analysis_details" ADD FOREIGN KEY ("generation_candidate_id") REFERENCES "structured_analysis_candidates"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "structured_analysis_details" ADD FOREIGN KEY ("ai_run_id") REFERENCES "ai_runs"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "mockup_details" ADD FOREIGN KEY ("artifact_version_id") REFERENCES "artifact_versions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "mockup_details" ADD FOREIGN KEY ("ui_blueprint_version_id") REFERENCES "artifact_versions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "structured_analysis_candidates" ADD CONSTRAINT "structured_analysis_candidates_nonblank" CHECK (btrim("candidate_id")<>'' AND btrim("title")<>'');
ALTER TABLE "mockup_details" ADD CONSTRAINT "mockup_details_values" CHECK (btrim("generator_version")<>'' AND btrim("svg")<>'');

CREATE FUNCTION "structured_analysis_validate_detail"() RETURNS trigger AS $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM artifact_versions av JOIN artifacts a ON a.id=av.artifact_id AND a.project_id=av.project_id WHERE av.id=NEW.artifact_version_id AND a.artifact_type_code=NEW.kind::text) THEN RAISE EXCEPTION 'structured analysis detail kind does not match artifact type' USING ERRCODE='check_violation'; END IF;
 IF NEW.generation_candidate_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM structured_analysis_candidates c JOIN structured_analysis_generations g ON g.id=c.generation_id WHERE c.id=NEW.generation_candidate_id AND c.generation_id=NEW.generation_id AND g.ai_run_id=NEW.ai_run_id AND g.kind=NEW.kind) THEN RAISE EXCEPTION 'invalid structured analysis provenance' USING ERRCODE='check_violation'; END IF;
 IF NEW.generation_candidate_id IS NULL AND (NEW.generation_id IS NOT NULL OR NEW.ai_run_id IS NOT NULL) THEN RAISE EXCEPTION 'partial structured analysis provenance' USING ERRCODE='check_violation'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "structured_analysis_validate_detail" BEFORE INSERT ON "structured_analysis_details" FOR EACH ROW EXECUTE FUNCTION "structured_analysis_validate_detail"();

CREATE FUNCTION "structured_analysis_validate_source"() RETURNS trigger AS $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM structured_analysis_generations g JOIN artifact_versions av ON av.id=NEW.artifact_version_id AND av.project_id=g.project_id WHERE g.id=NEW.generation_id AND av.status='APPROVED') THEN RAISE EXCEPTION 'generation source must be an approved version in the same project' USING ERRCODE='check_violation'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "structured_analysis_validate_source" BEFORE INSERT ON "structured_analysis_generation_sources" FOR EACH ROW EXECUTE FUNCTION "structured_analysis_validate_source"();

CREATE FUNCTION "structured_analysis_validate_acceptance"() RETURNS trigger AS $$ BEGIN
 IF NEW.accepted_artifact_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM structured_analysis_generations g JOIN artifacts a ON a.id=NEW.accepted_artifact_id WHERE g.id=NEW.generation_id AND a.project_id=g.project_id AND a.artifact_type_code=g.kind::text) THEN RAISE EXCEPTION 'accepted artifact must match the generation kind and project' USING ERRCODE='check_violation'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "structured_analysis_validate_acceptance" BEFORE UPDATE OF "accepted_artifact_id" ON "structured_analysis_candidates" FOR EACH ROW EXECUTE FUNCTION "structured_analysis_validate_acceptance"();

CREATE FUNCTION "mockup_validate_detail"() RETURNS trigger AS $$ DECLARE mockup_project UUID; source_project UUID; source_type TEXT; source_status "artifact_version_status"; BEGIN
 SELECT av.project_id INTO mockup_project FROM artifact_versions av JOIN artifacts a ON a.id=av.artifact_id AND a.project_id=av.project_id WHERE av.id=NEW.artifact_version_id AND a.artifact_type_code='MOCKUP';
 SELECT av.project_id, a.artifact_type_code, av.status INTO source_project, source_type, source_status FROM artifact_versions av JOIN artifacts a ON a.id=av.artifact_id AND a.project_id=av.project_id WHERE av.id=NEW.ui_blueprint_version_id;
 IF mockup_project IS NULL OR source_project IS NULL OR mockup_project<>source_project OR source_type<>'UI_BLUEPRINT' OR source_status<>'APPROVED' THEN RAISE EXCEPTION 'mockup requires a MOCKUP artifact and an exact approved UI_BLUEPRINT version in the same project' USING ERRCODE='check_violation'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "mockup_validate_detail" BEFORE INSERT ON "mockup_details" FOR EACH ROW EXECUTE FUNCTION "mockup_validate_detail"();

CREATE TRIGGER "structured_analysis_details_enforce_immutability" BEFORE UPDATE OR DELETE ON "structured_analysis_details" FOR EACH ROW EXECUTE FUNCTION "project_context_rows_enforce_immutability"();
CREATE TRIGGER "mockup_details_enforce_immutability" BEFORE UPDATE OR DELETE ON "mockup_details" FOR EACH ROW EXECUTE FUNCTION "project_context_rows_enforce_immutability"();
