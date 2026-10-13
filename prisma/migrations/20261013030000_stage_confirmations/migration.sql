CREATE TABLE stage_confirmations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  stage TEXT NOT NULL CHECK (stage IN ('SOURCES','CONTEXT','REQUIREMENTS','USE_CASES','USE_CASE_DIAGRAM','DATA_MODEL','ER_DIAGRAM','CLASS_DIAGRAM','NAVIGATION','SOFTWARE_ARCHITECTURE','SYSTEM_ARCHITECTURE','UI_BLUEPRINT','DESIGN_THEME','MOCKUPS')),
  confirmed_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  confirmed_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  note TEXT CHECK (length(note) <= 500)
);
CREATE INDEX stage_confirmations_project_id_stage_confirmed_at_idx ON stage_confirmations(project_id, stage, confirmed_at);
CREATE FUNCTION stage_confirmations_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('caseflow.project_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'stage confirmations are append-only' USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER stage_confirmations_append_only BEFORE UPDATE OR DELETE ON stage_confirmations
FOR EACH ROW EXECUTE FUNCTION stage_confirmations_append_only();
