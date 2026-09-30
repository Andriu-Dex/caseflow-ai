-- Implementation Plan (spec §196): a structured-analysis kind derived from an
-- approved Design Baseline; it also defines the generated project's physical
-- data model and API contract.
ALTER TYPE "structured_analysis_kind" ADD VALUE 'IMPLEMENTATION_PLAN';

INSERT INTO "artifact_types" ("code", "default_code_prefix") VALUES
    ('IMPLEMENTATION_PLAN', 'PI');
