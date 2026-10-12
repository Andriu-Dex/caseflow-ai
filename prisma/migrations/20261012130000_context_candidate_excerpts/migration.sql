-- Which cited sources a context proposal read as excerpts because they were
-- too long for its budget (DEC-127). Additive; older proposals read all whole.
ALTER TABLE "project_context_candidates"
  ADD COLUMN "partial_source_version_ids" JSONB NOT NULL DEFAULT '[]';
