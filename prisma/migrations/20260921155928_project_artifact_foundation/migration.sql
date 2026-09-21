-- CreateEnum
CREATE TYPE "artifact_version_status" AS ENUM ('DRAFT', 'GENERATED', 'IN_REVIEW', 'APPROVED', 'CHANGES_REQUESTED');

-- CreateEnum
CREATE TYPE "artifact_origin" AS ENUM ('MANUAL', 'AI_GENERATED', 'AI_ASSISTED', 'IMPORTED');

-- CreateTable
CREATE TABLE "workspaces" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artifact_types" (
    "code" TEXT NOT NULL,
    "default_code_prefix" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "artifact_types_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "artifacts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "artifact_type_code" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artifact_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "artifact_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "status" "artifact_version_status" NOT NULL,
    "origin" "artifact_origin" NOT NULL,
    "metadata_auxiliary" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" TIMESTAMPTZ(6),
    "approved_at" TIMESTAMPTZ(6),

    CONSTRAINT "artifact_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_code_counters" (
    "project_id" UUID NOT NULL,
    "code_prefix" TEXT NOT NULL,
    "last_number" INTEGER NOT NULL,

    CONSTRAINT "project_code_counters_pkey" PRIMARY KEY ("project_id","code_prefix")
);

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_slug_key" ON "workspaces"("slug");

-- CreateIndex
CREATE INDEX "projects_workspace_id_created_at_id_idx" ON "projects"("workspace_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "artifacts_project_id_artifact_type_code_idx" ON "artifacts"("project_id", "artifact_type_code");

-- CreateIndex
CREATE UNIQUE INDEX "artifacts_project_id_code_key" ON "artifacts"("project_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "artifacts_id_project_id_key" ON "artifacts"("id", "project_id");

-- CreateIndex
CREATE INDEX "artifact_versions_project_id_idx" ON "artifact_versions"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "artifact_versions_artifact_id_version_number_key" ON "artifact_versions"("artifact_id", "version_number");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_artifact_type_code_fkey" FOREIGN KEY ("artifact_type_code") REFERENCES "artifact_types"("code") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "artifact_versions" ADD CONSTRAINT "artifact_versions_artifact_id_project_id_fkey" FOREIGN KEY ("artifact_id", "project_id") REFERENCES "artifacts"("id", "project_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_code_counters" ADD CONSTRAINT "project_code_counters_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ---------------------------------------------------------------------------
-- Hand-written database rules (not expressible in schema.prisma).
-- ---------------------------------------------------------------------------

-- Format / integrity CHECK constraints.
ALTER TABLE "workspaces"
    ADD CONSTRAINT "workspaces_slug_format_check"
        CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length("slug") <= 63),
    ADD CONSTRAINT "workspaces_name_not_blank_check" CHECK (btrim("name") <> '');

ALTER TABLE "projects"
    ADD CONSTRAINT "projects_name_not_blank_check" CHECK (btrim("name") <> '');

ALTER TABLE "artifact_types"
    ADD CONSTRAINT "artifact_types_code_format_check" CHECK ("code" ~ '^[A-Z][A-Z0-9_]*$'),
    ADD CONSTRAINT "artifact_types_default_code_prefix_format_check"
        CHECK ("default_code_prefix" ~ '^[A-Z][A-Z0-9]{1,7}$');

ALTER TABLE "artifacts"
    ADD CONSTRAINT "artifacts_code_format_check" CHECK ("code" ~ '^[A-Z][A-Z0-9]{1,7}-[0-9]{3,}$');

ALTER TABLE "artifact_versions"
    ADD CONSTRAINT "artifact_versions_version_number_positive_check" CHECK ("version_number" >= 1),
    ADD CONSTRAINT "artifact_versions_title_not_blank_check" CHECK (btrim("title") <> ''),
    ADD CONSTRAINT "artifact_versions_metadata_auxiliary_object_check"
        CHECK (jsonb_typeof("metadata_auxiliary") = 'object'),
    -- approved_at is set if and only if the version is APPROVED.
    ADD CONSTRAINT "artifact_versions_approved_at_consistency_check"
        CHECK (("status" = 'APPROVED') = ("approved_at" IS NOT NULL));

ALTER TABLE "project_code_counters"
    ADD CONSTRAINT "project_code_counters_code_prefix_format_check"
        CHECK ("code_prefix" ~ '^[A-Z][A-Z0-9]{1,7}$'),
    ADD CONSTRAINT "project_code_counters_last_number_check" CHECK ("last_number" >= 0);

-- Controlled artifact types required by the First Deliverable MVP (spec §217).
-- Later slices add further types with additional INSERT migrations.
INSERT INTO "artifact_types" ("code", "default_code_prefix") VALUES
    ('REQUIREMENT', 'RF'),
    ('USE_CASE', 'CU'),
    ('DATA_MODEL', 'MD'),
    ('USE_CASE_DIAGRAM', 'DIA'),
    ('NAVIGATION_TREE', 'NAV'),
    ('SOFTWARE_ARCHITECTURE', 'ARQ'),
    ('SYSTEM_ARCHITECTURE', 'ARQ'),
    ('UI_BLUEPRINT', 'UI'),
    ('MOCKUP', 'MCK');

-- ArtifactVersion immutability (spec §15.2, §5.3).
--   * A version can never be deleted.
--   * Content columns (identity, title, origin, metadata_auxiliary, created_at)
--     can never change: editing an artifact creates a new version.
--   * Only lifecycle columns (status, submitted_at, approved_at) may change,
--     and never on a version that is already APPROVED.
CREATE FUNCTION "artifact_versions_enforce_immutability"() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'artifact_versions rows cannot be deleted'
            USING ERRCODE = 'restrict_violation';
    END IF;

    IF OLD."status" = 'APPROVED' THEN
        RAISE EXCEPTION 'approved artifact versions are immutable'
            USING ERRCODE = 'restrict_violation';
    END IF;

    IF NEW."id" IS DISTINCT FROM OLD."id"
        OR NEW."artifact_id" IS DISTINCT FROM OLD."artifact_id"
        OR NEW."project_id" IS DISTINCT FROM OLD."project_id"
        OR NEW."version_number" IS DISTINCT FROM OLD."version_number"
        OR NEW."title" IS DISTINCT FROM OLD."title"
        OR NEW."origin" IS DISTINCT FROM OLD."origin"
        OR NEW."metadata_auxiliary" IS DISTINCT FROM OLD."metadata_auxiliary"
        OR NEW."created_at" IS DISTINCT FROM OLD."created_at"
    THEN
        RAISE EXCEPTION 'artifact version content is immutable; create a new version instead'
            USING ERRCODE = 'restrict_violation';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "artifact_versions_enforce_immutability"
    BEFORE UPDATE OR DELETE ON "artifact_versions"
    FOR EACH ROW EXECUTE FUNCTION "artifact_versions_enforce_immutability"();

-- Artifact identity (spec §31.1) is stable: an artifact can never move to
-- another project, change type or change code.
CREATE FUNCTION "artifacts_enforce_stable_identity"() RETURNS trigger AS $$
BEGIN
    IF NEW."id" IS DISTINCT FROM OLD."id"
        OR NEW."project_id" IS DISTINCT FROM OLD."project_id"
        OR NEW."artifact_type_code" IS DISTINCT FROM OLD."artifact_type_code"
        OR NEW."code" IS DISTINCT FROM OLD."code"
    THEN
        RAISE EXCEPTION 'artifact identity columns are immutable'
            USING ERRCODE = 'restrict_violation';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "artifacts_enforce_stable_identity"
    BEFORE UPDATE ON "artifacts"
    FOR EACH ROW EXECUTE FUNCTION "artifacts_enforce_stable_identity"();
