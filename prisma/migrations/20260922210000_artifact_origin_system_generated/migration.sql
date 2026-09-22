-- Increment 1F.1 (Diagram Rendering Stabilization): additive ArtifactOrigin
-- value for deterministically derived artifacts (e.g. Use Case Diagram),
-- distinct from MANUAL, AI_GENERATED and AI_ASSISTED. Existing rows/values are
-- untouched; this only extends the enum.
ALTER TYPE "artifact_origin" ADD VALUE 'SYSTEM_GENERATED';
