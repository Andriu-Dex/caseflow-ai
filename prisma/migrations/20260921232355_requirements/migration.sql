-- CreateEnum
CREATE TYPE "requirement_type" AS ENUM ('FUNCTIONAL', 'NON_FUNCTIONAL');

-- CreateEnum
CREATE TYPE "requirement_priority" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateTable
CREATE TABLE "requirement_details" (
    "artifact_version_id" UUID NOT NULL,
    "requirement_type" "requirement_type" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priority" "requirement_priority" NOT NULL,
    "generation_candidate_id" UUID,
    "source_context_version_id" UUID,
    "ai_run_id" UUID,

    CONSTRAINT "requirement_details_pkey" PRIMARY KEY ("artifact_version_id")
);

-- CreateTable
CREATE TABLE "requirement_actors" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "artifact_version_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "requirement_actors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requirement_preconditions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "artifact_version_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "requirement_preconditions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requirement_postconditions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "artifact_version_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "requirement_postconditions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requirement_dependencies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "artifact_version_id" UUID NOT NULL,
    "depends_on_artifact_id" UUID NOT NULL,

    CONSTRAINT "requirement_dependencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requirement_generations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "source_context_version_id" UUID NOT NULL,
    "ai_run_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "requirement_generations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requirement_candidates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "generation_id" UUID NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "requirement_type" "requirement_type" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priority" "requirement_priority" NOT NULL,
    "actors" JSONB NOT NULL,
    "preconditions" JSONB NOT NULL,
    "postconditions" JSONB NOT NULL,
    "accepted_artifact_id" UUID,

    CONSTRAINT "requirement_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requirement_candidate_dependencies" (
    "candidate_id" UUID NOT NULL,
    "depends_on_candidate_id" UUID NOT NULL,

    CONSTRAINT "requirement_candidate_dependencies_pkey" PRIMARY KEY ("candidate_id","depends_on_candidate_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "requirement_details_generation_candidate_id_key" ON "requirement_details"("generation_candidate_id");

-- CreateIndex
CREATE UNIQUE INDEX "requirement_actors_artifact_version_id_position_key" ON "requirement_actors"("artifact_version_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "requirement_preconditions_artifact_version_id_position_key" ON "requirement_preconditions"("artifact_version_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "requirement_postconditions_artifact_version_id_position_key" ON "requirement_postconditions"("artifact_version_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "requirement_dependencies_artifact_version_id_depends_on_art_key" ON "requirement_dependencies"("artifact_version_id", "depends_on_artifact_id");

-- CreateIndex
CREATE UNIQUE INDEX "requirement_generations_ai_run_id_key" ON "requirement_generations"("ai_run_id");

-- CreateIndex
CREATE INDEX "requirement_generations_project_id_created_at_idx" ON "requirement_generations"("project_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "requirement_candidates_generation_id_candidate_id_key" ON "requirement_candidates"("generation_id", "candidate_id");

-- AddForeignKey
ALTER TABLE "requirement_details" ADD CONSTRAINT "requirement_details_artifact_version_id_fkey" FOREIGN KEY ("artifact_version_id") REFERENCES "artifact_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_details" ADD CONSTRAINT "requirement_details_source_context_version_id_fkey" FOREIGN KEY ("source_context_version_id") REFERENCES "artifact_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_details" ADD CONSTRAINT "requirement_details_ai_run_id_fkey" FOREIGN KEY ("ai_run_id") REFERENCES "ai_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_actors" ADD CONSTRAINT "requirement_actors_artifact_version_id_fkey" FOREIGN KEY ("artifact_version_id") REFERENCES "requirement_details"("artifact_version_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_preconditions" ADD CONSTRAINT "requirement_preconditions_artifact_version_id_fkey" FOREIGN KEY ("artifact_version_id") REFERENCES "requirement_details"("artifact_version_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_postconditions" ADD CONSTRAINT "requirement_postconditions_artifact_version_id_fkey" FOREIGN KEY ("artifact_version_id") REFERENCES "requirement_details"("artifact_version_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_dependencies" ADD CONSTRAINT "requirement_dependencies_artifact_version_id_fkey" FOREIGN KEY ("artifact_version_id") REFERENCES "requirement_details"("artifact_version_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_generations" ADD CONSTRAINT "requirement_generations_ai_run_id_fkey" FOREIGN KEY ("ai_run_id") REFERENCES "ai_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_candidates" ADD CONSTRAINT "requirement_candidates_generation_id_fkey" FOREIGN KEY ("generation_id") REFERENCES "requirement_generations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_candidate_dependencies" ADD CONSTRAINT "requirement_candidate_dependencies_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "requirement_candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_candidate_dependencies" ADD CONSTRAINT "requirement_candidate_dependencies_depends_on_candidate_id_fkey" FOREIGN KEY ("depends_on_candidate_id") REFERENCES "requirement_candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "requirement_generations" ADD CONSTRAINT "requirement_generations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "requirement_generations" ADD CONSTRAINT "requirement_generations_source_context_project_fkey" FOREIGN KEY ("source_context_version_id", "project_id") REFERENCES "artifact_versions"("id", "project_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "requirement_dependencies" ADD CONSTRAINT "requirement_dependencies_depends_on_artifact_id_fkey" FOREIGN KEY ("depends_on_artifact_id") REFERENCES "artifacts"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "requirement_candidates" ADD CONSTRAINT "requirement_candidates_accepted_artifact_id_fkey" FOREIGN KEY ("accepted_artifact_id") REFERENCES "artifacts"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "requirement_details" ADD CONSTRAINT "requirement_details_nonblank_check" CHECK (btrim("name") <> '' AND btrim("description") <> '');
ALTER TABLE "requirement_actors" ADD CONSTRAINT "requirement_actors_values_check" CHECK ("position" >= 0 AND btrim("name") <> '');
ALTER TABLE "requirement_preconditions" ADD CONSTRAINT "requirement_preconditions_values_check" CHECK ("position" >= 0 AND btrim("description") <> '');
ALTER TABLE "requirement_postconditions" ADD CONSTRAINT "requirement_postconditions_values_check" CHECK ("position" >= 0 AND btrim("description") <> '');
ALTER TABLE "requirement_candidate_dependencies" ADD CONSTRAINT "requirement_candidate_dependencies_no_self_check" CHECK ("candidate_id" <> "depends_on_candidate_id");

CREATE FUNCTION "requirements_validate_relations"() RETURNS trigger AS $$
DECLARE owner_project UUID; dependency_project UUID;
BEGIN
  SELECT av.project_id INTO owner_project FROM artifact_versions av WHERE av.id = NEW.artifact_version_id;
  SELECT a.project_id INTO dependency_project FROM artifacts a WHERE a.id = NEW.depends_on_artifact_id AND a.artifact_type_code = 'REQUIREMENT';
  IF dependency_project IS NULL OR owner_project <> dependency_project THEN RAISE EXCEPTION 'requirement dependency must target a requirement in the same project' USING ERRCODE='check_violation'; END IF;
  IF EXISTS (SELECT 1 FROM artifact_versions av WHERE av.id=NEW.artifact_version_id AND av.artifact_id=NEW.depends_on_artifact_id) THEN RAISE EXCEPTION 'requirement cannot depend on itself' USING ERRCODE='check_violation'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "requirements_validate_relations" BEFORE INSERT ON "requirement_dependencies" FOR EACH ROW EXECUTE FUNCTION "requirements_validate_relations"();

CREATE FUNCTION "requirement_details_validate_type"() RETURNS trigger AS $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM artifact_versions av JOIN artifacts a ON a.id=av.artifact_id AND a.project_id=av.project_id WHERE av.id=NEW.artifact_version_id AND a.artifact_type_code='REQUIREMENT') THEN RAISE EXCEPTION 'requirement detail requires REQUIREMENT artifact' USING ERRCODE='check_violation'; END IF;
 RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "requirement_details_validate_type" BEFORE INSERT ON "requirement_details" FOR EACH ROW EXECUTE FUNCTION "requirement_details_validate_type"();

CREATE FUNCTION "requirement_candidate_dependency_validate"() RETURNS trigger AS $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM requirement_candidates a JOIN requirement_candidates b ON b.id=NEW.depends_on_candidate_id WHERE a.id=NEW.candidate_id AND a.generation_id=b.generation_id) THEN RAISE EXCEPTION 'candidate dependencies must belong to one generation' USING ERRCODE='check_violation'; END IF;
 RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "requirement_candidate_dependency_validate" BEFORE INSERT ON "requirement_candidate_dependencies" FOR EACH ROW EXECUTE FUNCTION "requirement_candidate_dependency_validate"();

CREATE TRIGGER "requirement_details_enforce_immutability" BEFORE UPDATE OR DELETE ON "requirement_details" FOR EACH ROW EXECUTE FUNCTION "project_context_rows_enforce_immutability"();
CREATE TRIGGER "requirement_actors_enforce_immutability" BEFORE UPDATE OR DELETE ON "requirement_actors" FOR EACH ROW EXECUTE FUNCTION "project_context_rows_enforce_immutability"();
CREATE TRIGGER "requirement_preconditions_enforce_immutability" BEFORE UPDATE OR DELETE ON "requirement_preconditions" FOR EACH ROW EXECUTE FUNCTION "project_context_rows_enforce_immutability"();
CREATE TRIGGER "requirement_postconditions_enforce_immutability" BEFORE UPDATE OR DELETE ON "requirement_postconditions" FOR EACH ROW EXECUTE FUNCTION "project_context_rows_enforce_immutability"();
CREATE TRIGGER "requirement_dependencies_enforce_immutability" BEFORE UPDATE OR DELETE ON "requirement_dependencies" FOR EACH ROW EXECUTE FUNCTION "project_context_rows_enforce_immutability"();
