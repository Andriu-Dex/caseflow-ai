-- Source fragments follow the text's sections and are found by PostgreSQL
-- full-text search in the project's language (DEC-127). Fragments are derived
-- from the immutable extracted text: they are rebuilt, never edited.
ALTER TABLE "source_fragments" ADD COLUMN "search_vector" tsvector;

CREATE INDEX "source_fragments_project_id_source_version_id_idx" ON "source_fragments"("project_id", "source_version_id");
CREATE INDEX "source_fragments_search_vector_idx" ON "source_fragments" USING GIN ("search_vector");
