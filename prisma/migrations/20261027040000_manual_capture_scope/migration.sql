CREATE FUNCTION user_manual_capture_scope() RETURNS trigger AS $$
DECLARE owner_project uuid; source_snapshot uuid;
BEGIN
 SELECT v.project_id,m.snapshot_id INTO owner_project,source_snapshot
 FROM user_manual_tasks t JOIN user_manual_details m ON m.artifact_version_id=t.manual_version_id
 JOIN artifact_versions v ON v.id=m.artifact_version_id WHERE t.id=NEW.task_id;
 IF NEW.storage_key IS NOT NULL AND NEW.storage_key NOT LIKE
   'projects/'||owner_project::text||'/manual-captures/'||source_snapshot::text||'/'||NEW.bundle_id::text||'/%' THEN
   RAISE EXCEPTION 'capture storage must belong to its project and snapshot' USING ERRCODE='check_violation';
 END IF;
 IF (NEW.role='' AND EXISTS(SELECT 1 FROM user_manual_task_roles WHERE task_id=NEW.task_id))
 OR (NEW.role<>'' AND NOT EXISTS(SELECT 1 FROM user_manual_task_roles WHERE task_id=NEW.task_id AND name=NEW.role)) THEN
   RAISE EXCEPTION 'capture role must belong to the manual task' USING ERRCODE='check_violation';
 END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER user_manual_capture_scope BEFORE INSERT ON user_manual_captures
FOR EACH ROW EXECUTE FUNCTION user_manual_capture_scope();
