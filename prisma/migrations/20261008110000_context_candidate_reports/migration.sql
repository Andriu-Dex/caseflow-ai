-- Which source reports guided a context proposal (DEC-124): each is the
-- report of a source version the proposal also cites. Additive; older
-- candidates used none.
ALTER TABLE "project_context_candidates"
  ADD COLUMN "report_source_version_ids" JSONB NOT NULL DEFAULT '[]';
