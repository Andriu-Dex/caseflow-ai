-- Generation Plan + Design Gate (spec §195): two structured-analysis kinds.
-- Enum values go in their own migration so no later statement in the same
-- transaction uses them.
ALTER TYPE "structured_analysis_kind" ADD VALUE 'GENERATION_PLAN';
ALTER TYPE "structured_analysis_kind" ADD VALUE 'CONCEPTUAL_DOMAIN_MODEL';

INSERT INTO "artifact_types" ("code", "default_code_prefix") VALUES
    ('GENERATION_PLAN', 'PG'),
    ('CONCEPTUAL_DOMAIN_MODEL', 'MC');
