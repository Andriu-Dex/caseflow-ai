-- Project theme and palette (DEC-118, ADR-003): a structured-analysis kind
-- frozen by the Design Baseline and consumed by mockups and the frontend.
ALTER TYPE "structured_analysis_kind" ADD VALUE 'DESIGN_THEME';
ALTER TYPE "design_baseline_role" ADD VALUE 'DESIGN_THEME' BEFORE 'MOCKUP';

INSERT INTO "artifact_types" ("code", "default_code_prefix") VALUES
    ('DESIGN_THEME', 'TEM');

-- Mandatory only for new projects: existing rows keep their approved design
-- intact (false), every project created from now on requires a theme (true).
ALTER TABLE "projects" ADD COLUMN "design_theme_required" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "projects" ALTER COLUMN "design_theme_required" SET DEFAULT true;

-- The exact approved theme a mockup was painted with (null: standard design).
ALTER TABLE "mockup_details" ADD COLUMN "design_theme_version_id" UUID;
ALTER TABLE "mockup_details" ADD CONSTRAINT "mockup_details_design_theme_version_id_fkey"
    FOREIGN KEY ("design_theme_version_id") REFERENCES "artifact_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
