-- Construction Foundation (spec §194): append-only audit trail and project-scoped
-- dependency proposals. Target templates themselves are versioned constants in code.

-- CreateEnum
CREATE TYPE "dependency_layer" AS ENUM ('FRONTEND', 'BACKEND', 'SHARED');

-- CreateEnum
CREATE TYPE "dependency_proposal_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "actor_user_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dependency_proposals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "target_template_identifier" TEXT NOT NULL,
    "target_template_version" INTEGER NOT NULL,
    "package_name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "layer" "dependency_layer" NOT NULL,
    "dev" BOOLEAN NOT NULL DEFAULT false,
    "justification" TEXT NOT NULL,
    "status" "dependency_proposal_status" NOT NULL DEFAULT 'PENDING',
    "requested_by_user_id" UUID,
    "decided_by_user_id" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "decision_note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dependency_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_events_project_id_created_at_idx" ON "audit_events"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_events_entity_type_entity_id_idx" ON "audit_events"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "dependency_proposals_project_id_status_idx" ON "dependency_proposals"("project_id", "status");

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dependency_proposals" ADD CONSTRAINT "dependency_proposals_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dependency_proposals" ADD CONSTRAINT "dependency_proposals_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dependency_proposals" ADD CONSTRAINT "dependency_proposals_decided_by_user_id_fkey" FOREIGN KEY ("decided_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Integrity rules Prisma cannot express --------------------------------------

-- Audit events are append-only in every application flow.
CREATE FUNCTION "audit_events_append_only"() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'audit_events rows are append-only'
        USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "audit_events_append_only"
    BEFORE UPDATE OR DELETE ON "audit_events"
    FOR EACH ROW EXECUTE FUNCTION "audit_events_append_only"();

-- A decision is recorded exactly when the proposal is no longer pending.
ALTER TABLE "dependency_proposals" ADD CONSTRAINT "dependency_proposals_decision_consistency"
    CHECK (("status" = 'PENDING') = ("decided_at" IS NULL AND "decided_by_user_id" IS NULL));

-- Exact semver only: generated manifests pin versions for reproducible runs.
ALTER TABLE "dependency_proposals" ADD CONSTRAINT "dependency_proposals_exact_version"
    CHECK ("version" ~ '^[0-9]+\.[0-9]+\.[0-9]+$');

-- At most one open-or-approved proposal per package, template and project;
-- rejected ones stay as history and a package can be proposed again.
CREATE UNIQUE INDEX "dependency_proposals_one_active_per_package"
    ON "dependency_proposals" ("project_id", "target_template_identifier", "target_template_version", "package_name")
    WHERE "status" <> 'REJECTED';

-- Decided proposals are final.
CREATE FUNCTION "dependency_proposals_decided_are_final"() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'dependency_proposals rows cannot be deleted'
            USING ERRCODE = 'restrict_violation';
    END IF;
    IF OLD."status" <> 'PENDING' THEN
        RAISE EXCEPTION 'decided dependency proposals are final'
            USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "dependency_proposals_decided_are_final"
    BEFORE UPDATE OR DELETE ON "dependency_proposals"
    FOR EACH ROW EXECUTE FUNCTION "dependency_proposals_decided_are_final"();

