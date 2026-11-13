CREATE OR REPLACE FUNCTION user_manual_rows_guard() RETURNS trigger AS $$
DECLARE version_id uuid; owner_project uuid; source_snapshot uuid;
BEGIN
 IF TG_OP='DELETE' AND current_setting('caseflow.project_purge',true)='on' THEN RETURN OLD; END IF;
 IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'user manual history is immutable' USING ERRCODE='restrict_violation'; END IF;
 IF TG_TABLE_NAME='user_manual_details' THEN
   version_id := NEW.artifact_version_id;
   SELECT project_id INTO owner_project FROM generated_project_snapshots WHERE id=NEW.snapshot_id;
   IF NOT EXISTS (SELECT 1 FROM artifact_versions v JOIN artifacts a ON a.id=v.artifact_id WHERE v.id=version_id AND v.project_id=owner_project AND a.artifact_type_code='USER_MANUAL') THEN
     RAISE EXCEPTION 'manual snapshot must belong to the same project' USING ERRCODE='check_violation';
   END IF;
 ELSIF TG_TABLE_NAME='user_manual_tasks' THEN
   version_id := NEW.manual_version_id;
   IF NOT EXISTS (SELECT 1 FROM user_manual_details m JOIN generated_project_snapshots s ON s.id=m.snapshot_id JOIN generated_files f ON f.generation_run_id=s.generation_run_id WHERE m.artifact_version_id=version_id AND f.id=NEW.generated_file_id) THEN
     RAISE EXCEPTION 'manual source file must belong to its snapshot' USING ERRCODE='check_violation';
   END IF;
 ELSE
   SELECT manual_version_id INTO version_id FROM user_manual_tasks WHERE id=NEW.task_id;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM artifact_versions WHERE id=version_id AND xmin::text=(txid_current() % 4294967296)::text AND status IN ('DRAFT','GENERATED')) THEN
   RAISE EXCEPTION 'manual content is insert-only in the version creation transaction' USING ERRCODE='restrict_violation';
 END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;

