-- AlterTable
ALTER TABLE "artifacts" ADD COLUMN     "archive_changed_at" TIMESTAMPTZ(6);


-- DEC-137: archiving or restoring an artifact records when, so the stages
-- after it can be reviewed, whichever service did it.
CREATE FUNCTION "artifacts_track_archive_change"() RETURNS trigger AS $$
BEGIN
    IF NEW."archived_at" IS DISTINCT FROM OLD."archived_at" THEN
        NEW."archive_changed_at" := now();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "artifacts_track_archive_change"
    BEFORE UPDATE OF "archived_at" ON "artifacts"
    FOR EACH ROW EXECUTE FUNCTION "artifacts_track_archive_change"();
