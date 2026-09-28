CREATE TABLE "use_case_generations" ("id" UUID NOT NULL DEFAULT gen_random_uuid(), "project_id" UUID NOT NULL, "ai_run_id" UUID NOT NULL, "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "use_case_generations_pkey" PRIMARY KEY ("id"));
CREATE TABLE "use_case_generation_sources" ("generation_id" UUID NOT NULL, "requirement_version_id" UUID NOT NULL, "source_id" TEXT NOT NULL, CONSTRAINT "use_case_generation_sources_pkey" PRIMARY KEY ("generation_id","requirement_version_id"));
CREATE TABLE "use_case_candidates" ("id" UUID NOT NULL DEFAULT gen_random_uuid(), "generation_id" UUID NOT NULL, "candidate_id" TEXT NOT NULL, "name" TEXT NOT NULL, "objective" TEXT NOT NULL, "primary_actor" TEXT NOT NULL, "secondary_actors" JSONB NOT NULL, "preconditions" JSONB NOT NULL, "postconditions" JSONB NOT NULL, "main_flow" JSONB NOT NULL, "alternative_flows" JSONB NOT NULL, "accepted_artifact_id" UUID, CONSTRAINT "use_case_candidates_pkey" PRIMARY KEY ("id"));
CREATE TABLE "use_case_candidate_sources" ("candidate_id" UUID NOT NULL, "generation_id" UUID NOT NULL, "requirement_version_id" UUID NOT NULL, CONSTRAINT "use_case_candidate_sources_pkey" PRIMARY KEY ("candidate_id","requirement_version_id"));
CREATE TABLE "use_case_details" ("artifact_version_id" UUID NOT NULL, "name" TEXT NOT NULL, "objective" TEXT NOT NULL, "primary_actor" TEXT NOT NULL, "generation_id" UUID, "generation_candidate_id" UUID, "ai_run_id" UUID, CONSTRAINT "use_case_details_pkey" PRIMARY KEY ("artifact_version_id"));
CREATE TABLE "use_case_secondary_actors" ("id" UUID NOT NULL DEFAULT gen_random_uuid(), "artifact_version_id" UUID NOT NULL, "position" INTEGER NOT NULL, "name" TEXT NOT NULL, CONSTRAINT "use_case_secondary_actors_pkey" PRIMARY KEY ("id"));
CREATE TABLE "use_case_preconditions" ("id" UUID NOT NULL DEFAULT gen_random_uuid(), "artifact_version_id" UUID NOT NULL, "position" INTEGER NOT NULL, "description" TEXT NOT NULL, CONSTRAINT "use_case_preconditions_pkey" PRIMARY KEY ("id"));
CREATE TABLE "use_case_postconditions" ("id" UUID NOT NULL DEFAULT gen_random_uuid(), "artifact_version_id" UUID NOT NULL, "position" INTEGER NOT NULL, "description" TEXT NOT NULL, CONSTRAINT "use_case_postconditions_pkey" PRIMARY KEY ("id"));
CREATE TABLE "use_case_main_flow_steps" ("id" UUID NOT NULL DEFAULT gen_random_uuid(), "artifact_version_id" UUID NOT NULL, "position" INTEGER NOT NULL, "actor" TEXT NOT NULL, "action" TEXT NOT NULL, CONSTRAINT "use_case_main_flow_steps_pkey" PRIMARY KEY ("id"));
CREATE TABLE "use_case_alternative_flows" ("id" UUID NOT NULL DEFAULT gen_random_uuid(), "artifact_version_id" UUID NOT NULL, "position" INTEGER NOT NULL, "name" TEXT NOT NULL, "condition" TEXT NOT NULL, CONSTRAINT "use_case_alternative_flows_pkey" PRIMARY KEY ("id"));
CREATE TABLE "use_case_alternative_flow_steps" ("id" UUID NOT NULL DEFAULT gen_random_uuid(), "alternative_flow_id" UUID NOT NULL, "position" INTEGER NOT NULL, "actor" TEXT NOT NULL, "action" TEXT NOT NULL, CONSTRAINT "use_case_alternative_flow_steps_pkey" PRIMARY KEY ("id"));
CREATE TABLE "use_case_requirement_links" ("artifact_version_id" UUID NOT NULL, "requirement_version_id" UUID NOT NULL, CONSTRAINT "use_case_requirement_links_pkey" PRIMARY KEY ("artifact_version_id","requirement_version_id"));

CREATE UNIQUE INDEX "use_case_generations_ai_run_id_key" ON "use_case_generations"("ai_run_id");
CREATE INDEX "use_case_generations_project_id_created_at_idx" ON "use_case_generations"("project_id","created_at");
CREATE UNIQUE INDEX "use_case_generation_sources_generation_id_source_id_key" ON "use_case_generation_sources"("generation_id","source_id");
CREATE UNIQUE INDEX "use_case_candidates_generation_id_candidate_id_key" ON "use_case_candidates"("generation_id","candidate_id");
CREATE UNIQUE INDEX "use_case_details_generation_candidate_id_key" ON "use_case_details"("generation_candidate_id");
CREATE UNIQUE INDEX "use_case_secondary_actors_artifact_version_id_position_key" ON "use_case_secondary_actors"("artifact_version_id","position");
CREATE UNIQUE INDEX "use_case_preconditions_artifact_version_id_position_key" ON "use_case_preconditions"("artifact_version_id","position");
CREATE UNIQUE INDEX "use_case_postconditions_artifact_version_id_position_key" ON "use_case_postconditions"("artifact_version_id","position");
CREATE UNIQUE INDEX "use_case_main_flow_steps_artifact_version_id_position_key" ON "use_case_main_flow_steps"("artifact_version_id","position");
CREATE UNIQUE INDEX "use_case_alternative_flows_artifact_version_id_position_key" ON "use_case_alternative_flows"("artifact_version_id","position");
CREATE UNIQUE INDEX "use_case_alternative_flow_steps_alternative_flow_id_position_key" ON "use_case_alternative_flow_steps"("alternative_flow_id","position");

ALTER TABLE "use_case_generations" ADD CONSTRAINT "use_case_generations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "use_case_generations" ADD CONSTRAINT "use_case_generations_ai_run_id_fkey" FOREIGN KEY ("ai_run_id") REFERENCES "ai_runs"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "use_case_generation_sources" ADD CONSTRAINT "use_case_generation_sources_generation_id_fkey" FOREIGN KEY ("generation_id") REFERENCES "use_case_generations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "use_case_generation_sources" ADD CONSTRAINT "use_case_generation_sources_requirement_version_id_fkey" FOREIGN KEY ("requirement_version_id") REFERENCES "artifact_versions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "use_case_candidates" ADD CONSTRAINT "use_case_candidates_generation_id_fkey" FOREIGN KEY ("generation_id") REFERENCES "use_case_generations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "use_case_candidates" ADD CONSTRAINT "use_case_candidates_accepted_artifact_id_fkey" FOREIGN KEY ("accepted_artifact_id") REFERENCES "artifacts"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "use_case_candidate_sources" ADD CONSTRAINT "use_case_candidate_sources_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "use_case_candidates"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "use_case_candidate_sources" ADD CONSTRAINT "use_case_candidate_sources_source_fkey" FOREIGN KEY ("generation_id","requirement_version_id") REFERENCES "use_case_generation_sources"("generation_id","requirement_version_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "use_case_details" ADD CONSTRAINT "use_case_details_artifact_version_id_fkey" FOREIGN KEY ("artifact_version_id") REFERENCES "artifact_versions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "use_case_details" ADD CONSTRAINT "use_case_details_generation_id_fkey" FOREIGN KEY ("generation_id") REFERENCES "use_case_generations"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "use_case_details" ADD CONSTRAINT "use_case_details_generation_candidate_id_fkey" FOREIGN KEY ("generation_candidate_id") REFERENCES "use_case_candidates"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "use_case_details" ADD CONSTRAINT "use_case_details_ai_run_id_fkey" FOREIGN KEY ("ai_run_id") REFERENCES "ai_runs"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "use_case_secondary_actors" ADD CONSTRAINT "use_case_secondary_actors_artifact_version_id_fkey" FOREIGN KEY ("artifact_version_id") REFERENCES "use_case_details"("artifact_version_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "use_case_preconditions" ADD CONSTRAINT "use_case_preconditions_artifact_version_id_fkey" FOREIGN KEY ("artifact_version_id") REFERENCES "use_case_details"("artifact_version_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "use_case_postconditions" ADD CONSTRAINT "use_case_postconditions_artifact_version_id_fkey" FOREIGN KEY ("artifact_version_id") REFERENCES "use_case_details"("artifact_version_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "use_case_main_flow_steps" ADD CONSTRAINT "use_case_main_flow_steps_artifact_version_id_fkey" FOREIGN KEY ("artifact_version_id") REFERENCES "use_case_details"("artifact_version_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "use_case_alternative_flows" ADD CONSTRAINT "use_case_alternative_flows_artifact_version_id_fkey" FOREIGN KEY ("artifact_version_id") REFERENCES "use_case_details"("artifact_version_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "use_case_alternative_flow_steps" ADD CONSTRAINT "use_case_alternative_flow_steps_alternative_flow_id_fkey" FOREIGN KEY ("alternative_flow_id") REFERENCES "use_case_alternative_flows"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "use_case_requirement_links" ADD CONSTRAINT "use_case_requirement_links_artifact_version_id_fkey" FOREIGN KEY ("artifact_version_id") REFERENCES "use_case_details"("artifact_version_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "use_case_requirement_links" ADD CONSTRAINT "use_case_requirement_links_requirement_version_id_fkey" FOREIGN KEY ("requirement_version_id") REFERENCES "artifact_versions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "use_case_details" ADD CONSTRAINT "use_case_details_nonblank_check" CHECK (btrim("name")<>'' AND btrim("objective")<>'' AND btrim("primary_actor")<>'');
ALTER TABLE "use_case_secondary_actors" ADD CONSTRAINT "use_case_secondary_actors_values_check" CHECK ("position">=0 AND btrim("name")<>'');
ALTER TABLE "use_case_preconditions" ADD CONSTRAINT "use_case_preconditions_values_check" CHECK ("position">=0 AND btrim("description")<>'');
ALTER TABLE "use_case_postconditions" ADD CONSTRAINT "use_case_postconditions_values_check" CHECK ("position">=0 AND btrim("description")<>'');
ALTER TABLE "use_case_main_flow_steps" ADD CONSTRAINT "use_case_main_flow_steps_values_check" CHECK ("position">=0 AND btrim("actor")<>'' AND btrim("action")<>'');
ALTER TABLE "use_case_alternative_flows" ADD CONSTRAINT "use_case_alternative_flows_values_check" CHECK ("position">=0 AND btrim("name")<>'' AND btrim("condition")<>'');
ALTER TABLE "use_case_alternative_flow_steps" ADD CONSTRAINT "use_case_alternative_flow_steps_values_check" CHECK ("position">=0 AND btrim("actor")<>'' AND btrim("action")<>'');

CREATE FUNCTION "use_case_validate_detail"() RETURNS trigger AS $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM artifact_versions av JOIN artifacts a ON a.id=av.artifact_id AND a.project_id=av.project_id WHERE av.id=NEW.artifact_version_id AND a.artifact_type_code='USE_CASE') THEN RAISE EXCEPTION 'use case detail requires USE_CASE artifact' USING ERRCODE='check_violation'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "use_case_validate_detail" BEFORE INSERT ON "use_case_details" FOR EACH ROW EXECUTE FUNCTION "use_case_validate_detail"();
CREATE FUNCTION "use_case_validate_requirement_link"() RETURNS trigger AS $$ DECLARE owner_project UUID; requirement_project UUID; BEGIN
 SELECT av.project_id INTO owner_project FROM artifact_versions av WHERE av.id=NEW.artifact_version_id;
 SELECT av.project_id INTO requirement_project FROM artifact_versions av JOIN artifacts a ON a.id=av.artifact_id AND a.project_id=av.project_id WHERE av.id=NEW.requirement_version_id AND a.artifact_type_code='REQUIREMENT';
 IF requirement_project IS NULL OR owner_project<>requirement_project THEN RAISE EXCEPTION 'use case requirement must be an exact requirement version in the same project' USING ERRCODE='check_violation'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "use_case_validate_requirement_link" BEFORE INSERT ON "use_case_requirement_links" FOR EACH ROW EXECUTE FUNCTION "use_case_validate_requirement_link"();
CREATE FUNCTION "use_case_validate_generation_source"() RETURNS trigger AS $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM use_case_generations g JOIN artifact_versions av ON av.id=NEW.requirement_version_id AND av.project_id=g.project_id JOIN artifacts a ON a.id=av.artifact_id AND a.project_id=av.project_id WHERE g.id=NEW.generation_id AND a.artifact_type_code='REQUIREMENT' AND av.status='APPROVED') THEN RAISE EXCEPTION 'generation source must be an approved requirement version in the same project' USING ERRCODE='check_violation'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "use_case_validate_generation_source" BEFORE INSERT ON "use_case_generation_sources" FOR EACH ROW EXECUTE FUNCTION "use_case_validate_generation_source"();
CREATE FUNCTION "use_case_validate_candidate_source"() RETURNS trigger AS $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM use_case_candidates c WHERE c.id=NEW.candidate_id AND c.generation_id=NEW.generation_id) THEN RAISE EXCEPTION 'candidate source must belong to candidate generation' USING ERRCODE='check_violation'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "use_case_validate_candidate_source" BEFORE INSERT ON "use_case_candidate_sources" FOR EACH ROW EXECUTE FUNCTION "use_case_validate_candidate_source"();
CREATE FUNCTION "use_case_validate_candidate_acceptance"() RETURNS trigger AS $$ BEGIN
 IF NEW.accepted_artifact_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM use_case_generations g JOIN artifacts a ON a.id=NEW.accepted_artifact_id WHERE g.id=NEW.generation_id AND a.project_id=g.project_id AND a.artifact_type_code='USE_CASE') THEN RAISE EXCEPTION 'accepted candidate artifact must be a use case in the generation project' USING ERRCODE='check_violation'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "use_case_validate_candidate_acceptance" BEFORE INSERT OR UPDATE OF "accepted_artifact_id" ON "use_case_candidates" FOR EACH ROW EXECUTE FUNCTION "use_case_validate_candidate_acceptance"();
CREATE FUNCTION "use_case_validate_provenance"() RETURNS trigger AS $$ BEGIN
 IF NEW.generation_candidate_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM use_case_candidates c JOIN use_case_generations g ON g.id=c.generation_id WHERE c.id=NEW.generation_candidate_id AND c.generation_id=NEW.generation_id AND g.ai_run_id=NEW.ai_run_id) THEN RAISE EXCEPTION 'use case provenance must reference one candidate, generation and AI run chain' USING ERRCODE='check_violation'; END IF;
 IF NEW.generation_candidate_id IS NULL AND (NEW.generation_id IS NOT NULL OR NEW.ai_run_id IS NOT NULL) THEN RAISE EXCEPTION 'partial use case provenance is not allowed' USING ERRCODE='check_violation'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "use_case_validate_provenance" BEFORE INSERT ON "use_case_details" FOR EACH ROW EXECUTE FUNCTION "use_case_validate_provenance"();

CREATE TRIGGER "use_case_details_enforce_immutability" BEFORE UPDATE OR DELETE ON "use_case_details" FOR EACH ROW EXECUTE FUNCTION "project_context_rows_enforce_immutability"();
CREATE TRIGGER "use_case_secondary_actors_enforce_immutability" BEFORE UPDATE OR DELETE ON "use_case_secondary_actors" FOR EACH ROW EXECUTE FUNCTION "project_context_rows_enforce_immutability"();
CREATE TRIGGER "use_case_preconditions_enforce_immutability" BEFORE UPDATE OR DELETE ON "use_case_preconditions" FOR EACH ROW EXECUTE FUNCTION "project_context_rows_enforce_immutability"();
CREATE TRIGGER "use_case_postconditions_enforce_immutability" BEFORE UPDATE OR DELETE ON "use_case_postconditions" FOR EACH ROW EXECUTE FUNCTION "project_context_rows_enforce_immutability"();
CREATE TRIGGER "use_case_main_flow_steps_enforce_immutability" BEFORE UPDATE OR DELETE ON "use_case_main_flow_steps" FOR EACH ROW EXECUTE FUNCTION "project_context_rows_enforce_immutability"();
CREATE TRIGGER "use_case_alternative_flows_enforce_immutability" BEFORE UPDATE OR DELETE ON "use_case_alternative_flows" FOR EACH ROW EXECUTE FUNCTION "project_context_rows_enforce_immutability"();
CREATE TRIGGER "use_case_alternative_flow_steps_enforce_immutability" BEFORE UPDATE OR DELETE ON "use_case_alternative_flow_steps" FOR EACH ROW EXECUTE FUNCTION "project_context_rows_enforce_immutability"();
CREATE TRIGGER "use_case_requirement_links_enforce_immutability" BEFORE UPDATE OR DELETE ON "use_case_requirement_links" FOR EACH ROW EXECUTE FUNCTION "project_context_rows_enforce_immutability"();
