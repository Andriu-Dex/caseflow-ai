-- Design Baseline (spec §160, DEC-094): the frozen set of exact approved versions
-- an official implementation plan and code generation are built from.

-- CreateEnum
CREATE TYPE "design_baseline_role" AS ENUM ('GENERATION_PLAN', 'CONCEPTUAL_DOMAIN_MODEL', 'NAVIGATION_TREE', 'UI_BLUEPRINT', 'MOCKUP', 'SOFTWARE_ARCHITECTURE', 'SYSTEM_ARCHITECTURE');

-- CreateTable
CREATE TABLE "design_baselines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "note" TEXT,
    "approved_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "design_baselines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "design_baseline_entries" (
    "baseline_id" UUID NOT NULL,
    "role" "design_baseline_role" NOT NULL,
    "artifact_version_id" UUID NOT NULL,

    CONSTRAINT "design_baseline_entries_pkey" PRIMARY KEY ("baseline_id","role")
);

-- CreateIndex
CREATE INDEX "design_baselines_project_id_created_at_idx" ON "design_baselines"("project_id", "created_at");

-- AddForeignKey
ALTER TABLE "design_baselines" ADD CONSTRAINT "design_baselines_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design_baselines" ADD CONSTRAINT "design_baselines_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design_baseline_entries" ADD CONSTRAINT "design_baseline_entries_baseline_id_fkey" FOREIGN KEY ("baseline_id") REFERENCES "design_baselines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design_baseline_entries" ADD CONSTRAINT "design_baseline_entries_artifact_version_id_fkey" FOREIGN KEY ("artifact_version_id") REFERENCES "artifact_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Integrity rules Prisma cannot express --------------------------------------

ALTER TABLE "design_baselines" ADD CONSTRAINT "design_baselines_label_nonblank"
    CHECK (btrim("label") <> '');

-- Each frozen version must be an APPROVED version of this baseline's project,
-- of the artifact type its role names.
CREATE FUNCTION "design_baseline_entries_validate"() RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM design_baselines b
        JOIN artifact_versions av ON av.id = NEW.artifact_version_id AND av.project_id = b.project_id
        JOIN artifacts a ON a.id = av.artifact_id AND a.project_id = av.project_id
        WHERE b.id = NEW.baseline_id
          AND av.status = 'APPROVED'
          AND a.artifact_type_code = NEW.role::text
    ) THEN
        RAISE EXCEPTION 'design baseline entries must be approved versions of the same project and matching type'
            USING ERRCODE = 'check_violation';
    END IF;
    -- A frozen mockup must be the one derived from the frozen UI blueprint.
    IF NEW.role = 'MOCKUP' AND NOT EXISTS (
        SELECT 1
        FROM mockup_details md
        JOIN design_baseline_entries ui ON ui.baseline_id = NEW.baseline_id AND ui.role = 'UI_BLUEPRINT'
        WHERE md.artifact_version_id = NEW.artifact_version_id
          AND md.ui_blueprint_version_id = ui.artifact_version_id
    ) THEN
        RAISE EXCEPTION 'the frozen mockup must derive from the frozen UI blueprint version'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "design_baseline_entries_validate"
    BEFORE INSERT ON "design_baseline_entries"
    FOR EACH ROW EXECUTE FUNCTION "design_baseline_entries_validate"();

-- Approved design baselines are history: never updated or deleted.
CREATE FUNCTION "design_baselines_immutable"() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'design baselines are immutable'
        USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "design_baselines_immutable"
    BEFORE UPDATE OR DELETE ON "design_baselines"
    FOR EACH ROW EXECUTE FUNCTION "design_baselines_immutable"();

CREATE TRIGGER "design_baseline_entries_immutable"
    BEFORE UPDATE OR DELETE ON "design_baseline_entries"
    FOR EACH ROW EXECUTE FUNCTION "design_baselines_immutable"();
