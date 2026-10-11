-- Requirements answer the approved Project Context (DEC-126): each version
-- records its origin — the context items it covers, or the user's decision
-- with a justification — and AI proposals carry the context codes they cite
-- plus optional ideas beyond the context. Additive: older requirements keep
-- a null origin and are shown as "Sin origen".

-- CreateEnum
CREATE TYPE "requirement_origin_kind" AS ENUM ('CONTEXT', 'USER_DECISION');

-- AlterTable
ALTER TABLE "requirement_candidates" ADD COLUMN     "context_item_codes" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "rationale" TEXT,
ADD COLUMN     "suggested" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "requirement_details" ADD COLUMN     "origin_justification" TEXT,
ADD COLUMN     "origin_kind" "requirement_origin_kind";

-- CreateTable
CREATE TABLE "requirement_context_links" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "artifact_version_id" UUID NOT NULL,
    "need_id" UUID,
    "constraint_id" UUID,
    "business_rule_id" UUID,

    CONSTRAINT "requirement_context_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "requirement_context_links_need_id_idx" ON "requirement_context_links"("need_id");

-- CreateIndex
CREATE INDEX "requirement_context_links_constraint_id_idx" ON "requirement_context_links"("constraint_id");

-- CreateIndex
CREATE INDEX "requirement_context_links_business_rule_id_idx" ON "requirement_context_links"("business_rule_id");

-- CreateIndex
CREATE UNIQUE INDEX "requirement_context_links_artifact_version_id_need_id_key" ON "requirement_context_links"("artifact_version_id", "need_id");

-- CreateIndex
CREATE UNIQUE INDEX "requirement_context_links_artifact_version_id_constraint_id_key" ON "requirement_context_links"("artifact_version_id", "constraint_id");

-- CreateIndex
CREATE UNIQUE INDEX "requirement_context_links_artifact_version_id_business_rule_key" ON "requirement_context_links"("artifact_version_id", "business_rule_id");

-- AddForeignKey
ALTER TABLE "requirement_context_links" ADD CONSTRAINT "requirement_context_links_artifact_version_id_fkey" FOREIGN KEY ("artifact_version_id") REFERENCES "requirement_details"("artifact_version_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_context_links" ADD CONSTRAINT "requirement_context_links_need_id_fkey" FOREIGN KEY ("need_id") REFERENCES "project_context_needs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_context_links" ADD CONSTRAINT "requirement_context_links_constraint_id_fkey" FOREIGN KEY ("constraint_id") REFERENCES "project_context_constraints"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_context_links" ADD CONSTRAINT "requirement_context_links_business_rule_id_fkey" FOREIGN KEY ("business_rule_id") REFERENCES "project_context_business_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "requirement_details" ADD CONSTRAINT "requirement_details_origin_check" CHECK (
  ("origin_kind" IS NULL AND "origin_justification" IS NULL)
  OR ("origin_kind" = 'CONTEXT')
  OR ("origin_kind" = 'USER_DECISION' AND "origin_justification" IS NOT NULL AND btrim("origin_justification") <> '')
);
ALTER TABLE "requirement_context_links" ADD CONSTRAINT "requirement_context_links_one_item_check" CHECK (
  num_nonnulls("need_id", "constraint_id", "business_rule_id") = 1
);
ALTER TABLE "requirement_candidates" ADD CONSTRAINT "requirement_candidates_suggestion_check" CHECK (
  NOT "suggested" OR ("rationale" IS NOT NULL AND btrim("rationale") <> '')
);

-- A link targets a context item of the same project; a requirement never
-- answers another project's context.
CREATE FUNCTION "requirement_context_links_validate"() RETURNS trigger AS $$
DECLARE owner_project UUID; item_project UUID;
BEGIN
  SELECT av.project_id INTO owner_project FROM artifact_versions av WHERE av.id = NEW.artifact_version_id;
  SELECT av.project_id INTO item_project FROM artifact_versions av
    JOIN artifacts a ON a.id = av.artifact_id AND a.artifact_type_code = 'PROJECT_CONTEXT'
    WHERE av.id = COALESCE(
      (SELECT n.artifact_version_id FROM project_context_needs n WHERE n.id = NEW.need_id),
      (SELECT c.artifact_version_id FROM project_context_constraints c WHERE c.id = NEW.constraint_id),
      (SELECT r.artifact_version_id FROM project_context_business_rules r WHERE r.id = NEW.business_rule_id)
    );
  IF item_project IS NULL OR owner_project <> item_project THEN
    RAISE EXCEPTION 'requirement context link must target a context item of the same project' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "requirement_context_links_validate" BEFORE INSERT ON "requirement_context_links" FOR EACH ROW EXECUTE FUNCTION "requirement_context_links_validate"();
CREATE TRIGGER "requirement_context_links_enforce_immutability" BEFORE UPDATE OR DELETE ON "requirement_context_links" FOR EACH ROW EXECUTE FUNCTION "project_context_rows_enforce_immutability"();
