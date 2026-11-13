-- Justified acceptances of screen evaluation findings (AGENTS.md §16).
CREATE TABLE "screen_design_exceptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "design_baseline_id" UUID NOT NULL,
    "route_path" TEXT NOT NULL,
    "findings_sha256" CHAR(64) NOT NULL,
    "findings" TEXT NOT NULL,
    "justification" TEXT NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "screen_design_exceptions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "screen_design_exceptions_justification_check" CHECK (length(btrim("justification")) >= 10)
);

CREATE UNIQUE INDEX "screen_design_exceptions_design_baseline_id_route_path_findings_sha256_key"
    ON "screen_design_exceptions"("design_baseline_id", "route_path", "findings_sha256");
CREATE INDEX "screen_design_exceptions_project_id_idx" ON "screen_design_exceptions"("project_id");

ALTER TABLE "screen_design_exceptions" ADD CONSTRAINT "screen_design_exceptions_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "screen_design_exceptions" ADD CONSTRAINT "screen_design_exceptions_design_baseline_id_fkey"
    FOREIGN KEY ("design_baseline_id") REFERENCES "design_baselines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "screen_design_exceptions" ADD CONSTRAINT "screen_design_exceptions_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Accepted exceptions are history: never edited, removed only with their project.
CREATE OR REPLACE FUNCTION public.screen_design_exceptions_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF TG_OP = 'DELETE' AND current_setting('caseflow.project_purge', true) = 'on' THEN
        RETURN OLD;
    END IF;
    RAISE EXCEPTION 'screen design exceptions are immutable' USING ERRCODE = 'restrict_violation';
END;
$function$;

CREATE TRIGGER screen_design_exceptions_immutable
    BEFORE UPDATE OR DELETE ON "screen_design_exceptions"
    FOR EACH ROW EXECUTE FUNCTION public.screen_design_exceptions_immutable();
