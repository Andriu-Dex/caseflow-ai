-- Hand-written screens of a design baseline (DEC-161).
ALTER TYPE "generated_file_origin" ADD VALUE 'MANUAL';

CREATE TABLE "screen_design_overrides" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "design_baseline_id" UUID NOT NULL,
    "route_path" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "content_sha256" CHAR(64) NOT NULL,
    "justification" TEXT NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "screen_design_overrides_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "screen_design_overrides_justification_check" CHECK (length(btrim("justification")) >= 10),
    CONSTRAINT "screen_design_overrides_content_check" CHECK (length("content") BETWEEN 1 AND 200000)
);

CREATE INDEX "screen_design_overrides_design_baseline_id_route_path_created_at_idx"
    ON "screen_design_overrides"("design_baseline_id", "route_path", "created_at");
CREATE INDEX "screen_design_overrides_project_id_idx" ON "screen_design_overrides"("project_id");

ALTER TABLE "screen_design_overrides" ADD CONSTRAINT "screen_design_overrides_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "screen_design_overrides" ADD CONSTRAINT "screen_design_overrides_design_baseline_id_fkey"
    FOREIGN KEY ("design_baseline_id") REFERENCES "design_baselines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "screen_design_overrides" ADD CONSTRAINT "screen_design_overrides_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Overrides are history: never edited, removed only with their project.
CREATE OR REPLACE FUNCTION public.screen_design_overrides_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF TG_OP = 'DELETE' AND current_setting('caseflow.project_purge', true) = 'on' THEN
        RETURN OLD;
    END IF;
    RAISE EXCEPTION 'screen design overrides are immutable' USING ERRCODE = 'restrict_violation';
END;
$function$;

CREATE TRIGGER screen_design_overrides_immutable
    BEFORE UPDATE OR DELETE ON "screen_design_overrides"
    FOR EACH ROW EXECUTE FUNCTION public.screen_design_overrides_immutable();
