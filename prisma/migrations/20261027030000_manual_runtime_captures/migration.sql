ALTER TABLE user_manual_jobs ADD COLUMN capture_requested boolean NOT NULL DEFAULT false;
CREATE TABLE user_manual_captures (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 task_id uuid NOT NULL REFERENCES user_manual_tasks(id) ON DELETE RESTRICT,
 bundle_id uuid NOT NULL,
 role text NOT NULL,
 status text NOT NULL CHECK (status IN ('CAPTURED','FAILED','SKIPPED')),
 reason text,
 storage_key text,
 sha256 text,
 width integer,
 height integer,
 profile text NOT NULL CHECK (profile='EMPTY_DATABASE_DESKTOP_V1'),
 UNIQUE(task_id,role),
 CONSTRAINT manual_capture_image CHECK (
   (status='CAPTURED' AND storage_key IS NOT NULL AND sha256 ~ '^[a-f0-9]{64}$' AND width=1440 AND height=900 AND reason IS NULL)
   OR (status<>'CAPTURED' AND storage_key IS NULL AND sha256 IS NULL AND width IS NULL AND height IS NULL AND reason IS NOT NULL)
 )
);
CREATE TRIGGER user_manual_captures_guard BEFORE INSERT OR UPDATE OR DELETE ON user_manual_captures
FOR EACH ROW EXECUTE FUNCTION user_manual_rows_guard();
