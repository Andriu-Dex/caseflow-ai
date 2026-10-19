-- A finished generation run stays immutable history, except for archived_at:
-- hiding a run from the list (or showing it again) changes nothing it records.
CREATE OR REPLACE FUNCTION public.generation_runs_enforce_lifecycle()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- DEC-134: only the transaction that deletes a whole project may remove
    -- this history; it sets caseflow.project_purge for itself (SET LOCAL).
    IF TG_OP = 'DELETE' AND current_setting('caseflow.project_purge', true) = 'on' THEN
        RETURN OLD;
    END IF;
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'generation runs cannot be deleted' USING ERRCODE = 'restrict_violation';
    END IF;
    IF OLD.status IN ('GENERATED', 'FAILED')
       AND (to_jsonb(NEW) - 'archived_at') IS DISTINCT FROM (to_jsonb(OLD) - 'archived_at') THEN
        RAISE EXCEPTION 'finished generation runs are immutable' USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.project_id <> OLD.project_id
       OR NEW.implementation_plan_version_id <> OLD.implementation_plan_version_id
       OR NEW.design_baseline_id <> OLD.design_baseline_id
       OR NEW.target_template_identifier <> OLD.target_template_identifier
       OR NEW.target_template_version <> OLD.target_template_version
       OR NEW.created_by_user_id <> OLD.created_by_user_id THEN
        RAISE EXCEPTION 'generation run inputs are immutable' USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END;
$function$;
