-- Domain class diagram (DEC-121, ADR-006): a structured-analysis kind with its
-- own deterministic Mermaid classDiagram.
ALTER TYPE "structured_analysis_kind" ADD VALUE 'CLASS_DIAGRAM';
ALTER TYPE "diagram_kind" ADD VALUE 'CLASS_DIAGRAM';
ALTER TYPE "diagram_source_format" ADD VALUE 'MERMAID_CLASS';
ALTER TYPE "design_baseline_role" ADD VALUE 'CLASS_DIAGRAM' BEFORE 'NAVIGATION_TREE';

INSERT INTO "artifact_types" ("code", "default_code_prefix") VALUES
    ('CLASS_DIAGRAM', 'DC');

-- Mandatory coherence only for new projects: existing rows keep their
-- approvals (false), every project created from now on enforces it (true).
ALTER TABLE "projects" ADD COLUMN "coherence_required" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "projects" ALTER COLUMN "coherence_required" SET DEFAULT true;
