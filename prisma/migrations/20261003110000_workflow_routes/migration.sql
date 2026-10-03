-- Workflow routes (DEC-116, ADR-001): FULL, EXPRESS or BUILD_ONLY, chosen at
-- project creation, and the explicit origin of every approval.

CREATE TYPE "workflow_route" AS ENUM ('FULL', 'EXPRESS', 'BUILD_ONLY');
CREATE TYPE "approval_origin" AS ENUM ('HUMAN', 'HUMAN_BULK', 'AUTOMATIC');

ALTER TABLE "projects" ADD COLUMN "workflow_route" "workflow_route" NOT NULL DEFAULT 'FULL';

-- A route only moves up (BUILD_ONLY -> EXPRESS -> FULL): moving down would
-- hide a review that already happened.
CREATE FUNCTION "projects_workflow_route_upgrade_only"() RETURNS trigger AS $$
DECLARE
    ranks CONSTANT text[] := ARRAY['BUILD_ONLY', 'EXPRESS', 'FULL'];
BEGIN
    IF array_position(ranks, NEW."workflow_route"::text) < array_position(ranks, OLD."workflow_route"::text) THEN
        RAISE EXCEPTION 'a workflow route can only be upgraded'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "projects_workflow_route_upgrade_only"
    BEFORE UPDATE OF "workflow_route" ON "projects"
    FOR EACH ROW EXECUTE FUNCTION "projects_workflow_route_upgrade_only"();

ALTER TABLE "artifact_versions" ADD COLUMN "approval_origin" "approval_origin";

-- Everything approved so far was approved by a person. Approved versions are
-- immutable, so the immutability trigger is paused for this one backfill.
ALTER TABLE "artifact_versions" DISABLE TRIGGER "artifact_versions_enforce_immutability";
UPDATE "artifact_versions" SET "approval_origin" = 'HUMAN' WHERE "status" = 'APPROVED';
ALTER TABLE "artifact_versions" ENABLE TRIGGER "artifact_versions_enforce_immutability";

ALTER TABLE "artifact_versions" ADD CONSTRAINT "artifact_versions_approval_origin_check"
    CHECK (("status" = 'APPROVED') = ("approval_origin" IS NOT NULL));

-- An approval is HUMAN unless the caller says otherwise; bulk and automatic
-- approvals are only valid in the route that allows them. Once approved, the
-- origin is frozen with the rest of the version (immutability trigger).
CREATE FUNCTION "artifact_versions_approval_origin"() RETURNS trigger AS $$
DECLARE
    route text;
BEGIN
    IF NEW."status" <> 'APPROVED' THEN
        NEW."approval_origin" := NULL;
        RETURN NEW;
    END IF;
    IF NEW."approval_origin" IS NULL THEN
        NEW."approval_origin" := 'HUMAN';
    END IF;
    IF NEW."approval_origin" <> 'HUMAN' THEN
        SELECT p."workflow_route"::text INTO route FROM projects p WHERE p.id = NEW."project_id";
        IF (NEW."approval_origin" = 'AUTOMATIC' AND route <> 'BUILD_ONLY')
            OR (NEW."approval_origin" = 'HUMAN_BULK' AND route <> 'EXPRESS') THEN
            RAISE EXCEPTION 'approval origin % is not allowed in the % workflow route',
                NEW."approval_origin", route
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Named to sort before "artifact_versions_enforce_immutability".
CREATE TRIGGER "artifact_versions_approval_origin"
    BEFORE INSERT OR UPDATE ON "artifact_versions"
    FOR EACH ROW EXECUTE FUNCTION "artifact_versions_approval_origin"();
