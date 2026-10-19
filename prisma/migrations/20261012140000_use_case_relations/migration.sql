-- CreateEnum
CREATE TYPE "UseCaseRelationKind" AS ENUM ('INCLUDE', 'EXTEND');

-- AlterTable
ALTER TABLE "use_case_candidates" ADD COLUMN     "relations" JSONB NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "use_case_relations" (
    "artifact_version_id" UUID NOT NULL,
    "target_artifact_id" UUID NOT NULL,
    "kind" "UseCaseRelationKind" NOT NULL,

    CONSTRAINT "use_case_relations_pkey" PRIMARY KEY ("artifact_version_id","target_artifact_id")
);

-- CreateIndex
CREATE INDEX "use_case_relations_target_artifact_id_idx" ON "use_case_relations"("target_artifact_id");

-- AddForeignKey
ALTER TABLE "use_case_relations" ADD CONSTRAINT "use_case_relations_artifact_version_id_fkey" FOREIGN KEY ("artifact_version_id") REFERENCES "use_case_details"("artifact_version_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "use_case_relations" ADD CONSTRAINT "use_case_relations_target_artifact_id_fkey" FOREIGN KEY ("target_artifact_id") REFERENCES "artifacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- A relation stays inside the project and between two different use cases,
-- and, like every other part of a use case version, never changes (DEC-129).
CREATE FUNCTION "use_case_validate_relation"() RETURNS trigger AS $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM artifact_versions av JOIN artifacts t ON t.id=NEW.target_artifact_id AND t.project_id=av.project_id WHERE av.id=NEW.artifact_version_id AND t.artifact_type_code='USE_CASE' AND t.id<>av.artifact_id) THEN RAISE EXCEPTION 'use case relation must target another use case in the same project' USING ERRCODE='check_violation'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "use_case_validate_relation" BEFORE INSERT ON "use_case_relations" FOR EACH ROW EXECUTE FUNCTION "use_case_validate_relation"();
CREATE TRIGGER "use_case_relations_enforce_immutability" BEFORE UPDATE OR DELETE ON "use_case_relations" FOR EACH ROW EXECUTE FUNCTION "project_context_rows_enforce_immutability"();
