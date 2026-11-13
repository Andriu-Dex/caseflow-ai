-- CreateTable
INSERT INTO artifact_types(code, default_code_prefix) VALUES ('USER_MANUAL', 'MAN');

CREATE TABLE "user_manual_details" (
    "artifact_version_id" UUID NOT NULL,
    "snapshot_id" UUID NOT NULL,
    "introduction" TEXT NOT NULL,

    CONSTRAINT "user_manual_details_pkey" PRIMARY KEY ("artifact_version_id")
);

-- CreateTable
CREATE TABLE "user_manual_tasks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "manual_version_id" UUID NOT NULL,
    "generated_file_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "route_path" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "user_manual_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_manual_task_roles" (
    "task_id" UUID NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "user_manual_task_roles_pkey" PRIMARY KEY ("task_id","name")
);

-- CreateTable
CREATE TABLE "user_manual_steps" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "task_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "instruction" TEXT NOT NULL,
    "expected_result" TEXT NOT NULL,

    CONSTRAINT "user_manual_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_manual_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "snapshot_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_manual_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_manual_details_snapshot_id_idx" ON "user_manual_details"("snapshot_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_manual_tasks_manual_version_id_position_key" ON "user_manual_tasks"("manual_version_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "user_manual_tasks_manual_version_id_route_path_key" ON "user_manual_tasks"("manual_version_id", "route_path");

-- CreateIndex
CREATE UNIQUE INDEX "user_manual_steps_task_id_position_key" ON "user_manual_steps"("task_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "user_manual_jobs_snapshot_id_key" ON "user_manual_jobs"("snapshot_id");

-- CreateIndex
CREATE INDEX "user_manual_jobs_project_id_status_idx" ON "user_manual_jobs"("project_id", "status");

-- AddForeignKey
ALTER TABLE "user_manual_details" ADD CONSTRAINT "user_manual_details_artifact_version_id_fkey" FOREIGN KEY ("artifact_version_id") REFERENCES "artifact_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_manual_details" ADD CONSTRAINT "user_manual_details_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "generated_project_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_manual_tasks" ADD CONSTRAINT "user_manual_tasks_manual_version_id_fkey" FOREIGN KEY ("manual_version_id") REFERENCES "user_manual_details"("artifact_version_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_manual_tasks" ADD CONSTRAINT "user_manual_tasks_generated_file_id_fkey" FOREIGN KEY ("generated_file_id") REFERENCES "generated_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_manual_task_roles" ADD CONSTRAINT "user_manual_task_roles_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "user_manual_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_manual_steps" ADD CONSTRAINT "user_manual_steps_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "user_manual_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_manual_jobs" ADD CONSTRAINT "user_manual_jobs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_manual_jobs" ADD CONSTRAINT "user_manual_jobs_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "generated_project_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE user_manual_jobs ADD CONSTRAINT user_manual_job_status CHECK (status IN ('QUEUED','RUNNING','COMPLETED','FAILED'));
ALTER TABLE user_manual_tasks ADD CONSTRAINT user_manual_task_position CHECK (position >= 0);
ALTER TABLE user_manual_steps ADD CONSTRAINT user_manual_step_position CHECK (position >= 0);

CREATE FUNCTION user_manual_rows_guard() RETURNS trigger AS $$
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
 IF NOT EXISTS (SELECT 1 FROM artifact_versions WHERE id=version_id AND created_at=transaction_timestamp() AND status IN ('DRAFT','GENERATED')) THEN
   RAISE EXCEPTION 'manual content is insert-only in the version creation transaction' USING ERRCODE='restrict_violation';
 END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER user_manual_details_guard BEFORE INSERT OR UPDATE OR DELETE ON user_manual_details FOR EACH ROW EXECUTE FUNCTION user_manual_rows_guard();
CREATE TRIGGER user_manual_tasks_guard BEFORE INSERT OR UPDATE OR DELETE ON user_manual_tasks FOR EACH ROW EXECUTE FUNCTION user_manual_rows_guard();
CREATE TRIGGER user_manual_steps_guard BEFORE INSERT OR UPDATE OR DELETE ON user_manual_steps FOR EACH ROW EXECUTE FUNCTION user_manual_rows_guard();
CREATE TRIGGER user_manual_roles_guard BEFORE INSERT OR UPDATE OR DELETE ON user_manual_task_roles FOR EACH ROW EXECUTE FUNCTION user_manual_rows_guard();
CREATE FUNCTION user_manual_job_scope() RETURNS trigger AS $$
BEGIN
 IF TG_OP='DELETE' AND current_setting('caseflow.project_purge',true)='on' THEN RETURN OLD; END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'manual jobs cannot be deleted individually' USING ERRCODE='restrict_violation'; END IF;
 IF TG_OP='UPDATE' AND (NEW.project_id<>OLD.project_id OR NEW.snapshot_id<>OLD.snapshot_id) THEN
   RAISE EXCEPTION 'manual job inputs are immutable' USING ERRCODE='restrict_violation';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM generated_project_snapshots WHERE id=NEW.snapshot_id AND project_id=NEW.project_id) THEN
   RAISE EXCEPTION 'manual job snapshot project mismatch' USING ERRCODE='check_violation';
 END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER user_manual_job_scope BEFORE INSERT OR UPDATE OR DELETE ON user_manual_jobs FOR EACH ROW EXECUTE FUNCTION user_manual_job_scope();
CREATE FUNCTION user_manual_approval_gate() RETURNS trigger AS $$
BEGIN
 IF NEW.status='APPROVED' AND OLD.status<>'APPROVED' AND EXISTS (SELECT 1 FROM artifacts WHERE id=NEW.artifact_id AND artifact_type_code='USER_MANUAL') THEN
   IF NOT EXISTS (SELECT 1 FROM user_manual_details WHERE artifact_version_id=NEW.id)
      OR NOT EXISTS (SELECT 1 FROM user_manual_tasks WHERE manual_version_id=NEW.id)
      OR EXISTS (SELECT 1 FROM user_manual_tasks WHERE manual_version_id=NEW.id AND NOT verified) THEN
     RAISE EXCEPTION 'all manual tasks require human verification' USING ERRCODE='check_violation';
   END IF;
 END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER user_manual_approval_gate BEFORE UPDATE ON artifact_versions FOR EACH ROW EXECUTE FUNCTION user_manual_approval_gate();
