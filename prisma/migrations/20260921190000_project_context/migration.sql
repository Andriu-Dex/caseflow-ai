-- Increment 1B: canonical, structured and versioned Project Context.
CREATE TYPE "project_context_scope_type" AS ENUM ('IN_SCOPE', 'OUT_OF_SCOPE');

INSERT INTO "artifact_types" ("code", "default_code_prefix")
VALUES ('PROJECT_CONTEXT', 'CTX');

-- A project owns at most one canonical PROJECT_CONTEXT artifact. A partial
-- unique index keeps other artifact types unrestricted.
CREATE UNIQUE INDEX "artifacts_one_project_context_per_project_key"
    ON "artifacts" ("project_id")
    WHERE "artifact_type_code" = 'PROJECT_CONTEXT';

CREATE TABLE "project_context_details" (
    "artifact_version_id" UUID NOT NULL,
    "problem_statement" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "additional_context" TEXT,
    CONSTRAINT "project_context_details_pkey" PRIMARY KEY ("artifact_version_id")
);

CREATE TABLE "project_context_actors" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "artifact_version_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    CONSTRAINT "project_context_actors_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_context_needs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "artifact_version_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    CONSTRAINT "project_context_needs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_context_constraints" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "artifact_version_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    CONSTRAINT "project_context_constraints_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_context_business_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "artifact_version_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    CONSTRAINT "project_context_business_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_context_scope_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "artifact_version_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "type" "project_context_scope_type" NOT NULL,
    "description" TEXT NOT NULL,
    CONSTRAINT "project_context_scope_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "project_context_actors_artifact_version_id_position_key"
    ON "project_context_actors" ("artifact_version_id", "position");
CREATE UNIQUE INDEX "project_context_needs_artifact_version_id_position_key"
    ON "project_context_needs" ("artifact_version_id", "position");
CREATE UNIQUE INDEX "project_context_constraints_artifact_version_id_position_key"
    ON "project_context_constraints" ("artifact_version_id", "position");
CREATE UNIQUE INDEX "project_context_business_rules_artifact_version_id_position_key"
    ON "project_context_business_rules" ("artifact_version_id", "position");
CREATE UNIQUE INDEX "project_context_scope_items_artifact_version_id_position_key"
    ON "project_context_scope_items" ("artifact_version_id", "position");

ALTER TABLE "project_context_details"
    ADD CONSTRAINT "project_context_details_problem_statement_not_blank_check"
        CHECK (btrim("problem_statement") <> ''),
    ADD CONSTRAINT "project_context_details_objective_not_blank_check"
        CHECK (btrim("objective") <> ''),
    ADD CONSTRAINT "project_context_details_additional_context_not_blank_check"
        CHECK ("additional_context" IS NULL OR btrim("additional_context") <> '');

ALTER TABLE "project_context_actors"
    ADD CONSTRAINT "project_context_actors_position_check" CHECK ("position" >= 0),
    ADD CONSTRAINT "project_context_actors_name_not_blank_check" CHECK (btrim("name") <> ''),
    ADD CONSTRAINT "project_context_actors_description_not_blank_check"
        CHECK ("description" IS NULL OR btrim("description") <> '');
ALTER TABLE "project_context_needs"
    ADD CONSTRAINT "project_context_needs_position_check" CHECK ("position" >= 0),
    ADD CONSTRAINT "project_context_needs_description_not_blank_check" CHECK (btrim("description") <> '');
ALTER TABLE "project_context_constraints"
    ADD CONSTRAINT "project_context_constraints_position_check" CHECK ("position" >= 0),
    ADD CONSTRAINT "project_context_constraints_description_not_blank_check" CHECK (btrim("description") <> '');
ALTER TABLE "project_context_business_rules"
    ADD CONSTRAINT "project_context_business_rules_position_check" CHECK ("position" >= 0),
    ADD CONSTRAINT "project_context_business_rules_description_not_blank_check" CHECK (btrim("description") <> '');
ALTER TABLE "project_context_scope_items"
    ADD CONSTRAINT "project_context_scope_items_position_check" CHECK ("position" >= 0),
    ADD CONSTRAINT "project_context_scope_items_description_not_blank_check" CHECK (btrim("description") <> '');

ALTER TABLE "project_context_details" ADD CONSTRAINT "project_context_details_artifact_version_id_fkey"
    FOREIGN KEY ("artifact_version_id") REFERENCES "artifact_versions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "project_context_actors" ADD CONSTRAINT "project_context_actors_artifact_version_id_fkey"
    FOREIGN KEY ("artifact_version_id") REFERENCES "project_context_details"("artifact_version_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "project_context_needs" ADD CONSTRAINT "project_context_needs_artifact_version_id_fkey"
    FOREIGN KEY ("artifact_version_id") REFERENCES "project_context_details"("artifact_version_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "project_context_constraints" ADD CONSTRAINT "project_context_constraints_artifact_version_id_fkey"
    FOREIGN KEY ("artifact_version_id") REFERENCES "project_context_details"("artifact_version_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "project_context_business_rules" ADD CONSTRAINT "project_context_business_rules_artifact_version_id_fkey"
    FOREIGN KEY ("artifact_version_id") REFERENCES "project_context_details"("artifact_version_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "project_context_scope_items" ADD CONSTRAINT "project_context_scope_items_artifact_version_id_fkey"
    FOREIGN KEY ("artifact_version_id") REFERENCES "project_context_details"("artifact_version_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- A subtype root may only be attached to a PROJECT_CONTEXT ArtifactVersion.
CREATE FUNCTION "project_context_details_validate_artifact_type"() RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM "artifact_versions" av
        JOIN "artifacts" a ON a."id" = av."artifact_id" AND a."project_id" = av."project_id"
        WHERE av."id" = NEW."artifact_version_id"
          AND a."artifact_type_code" = 'PROJECT_CONTEXT'
    ) THEN
        RAISE EXCEPTION 'project context details require a PROJECT_CONTEXT artifact version'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "project_context_details_validate_artifact_type"
    BEFORE INSERT ON "project_context_details"
    FOR EACH ROW EXECUTE FUNCTION "project_context_details_validate_artifact_type"();

-- Every row is an immutable part of an ArtifactVersion snapshot.
CREATE FUNCTION "project_context_rows_enforce_immutability"() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'project context version snapshots are immutable'
        USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "project_context_details_enforce_immutability"
    BEFORE UPDATE OR DELETE ON "project_context_details"
    FOR EACH ROW EXECUTE FUNCTION "project_context_rows_enforce_immutability"();
CREATE TRIGGER "project_context_actors_enforce_immutability"
    BEFORE UPDATE OR DELETE ON "project_context_actors"
    FOR EACH ROW EXECUTE FUNCTION "project_context_rows_enforce_immutability"();
CREATE TRIGGER "project_context_needs_enforce_immutability"
    BEFORE UPDATE OR DELETE ON "project_context_needs"
    FOR EACH ROW EXECUTE FUNCTION "project_context_rows_enforce_immutability"();
CREATE TRIGGER "project_context_constraints_enforce_immutability"
    BEFORE UPDATE OR DELETE ON "project_context_constraints"
    FOR EACH ROW EXECUTE FUNCTION "project_context_rows_enforce_immutability"();
CREATE TRIGGER "project_context_business_rules_enforce_immutability"
    BEFORE UPDATE OR DELETE ON "project_context_business_rules"
    FOR EACH ROW EXECUTE FUNCTION "project_context_rows_enforce_immutability"();
CREATE TRIGGER "project_context_scope_items_enforce_immutability"
    BEFORE UPDATE OR DELETE ON "project_context_scope_items"
    FOR EACH ROW EXECUTE FUNCTION "project_context_rows_enforce_immutability"();
