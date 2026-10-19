-- A person may hide a generation run from the list; nothing is deleted.
ALTER TABLE "generation_runs" ADD COLUMN "archived_at" TIMESTAMPTZ(6);
