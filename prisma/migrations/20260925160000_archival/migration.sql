-- Archival (spec §87: "fuentes utilizadas → archivar antes que borrar").
-- Purely additive columns on the top-level identity rows (Artifact,
-- Project) — never on ArtifactVersion content, so this needs no
-- immutability-trigger exception at all.

ALTER TABLE "artifacts" ADD COLUMN "archived_at" TIMESTAMPTZ(6);
ALTER TABLE "projects" ADD COLUMN "archived_at" TIMESTAMPTZ(6);
