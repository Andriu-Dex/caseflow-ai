ALTER TABLE user_manual_jobs DROP CONSTRAINT user_manual_job_status;
ALTER TABLE user_manual_jobs ADD CONSTRAINT user_manual_job_status CHECK (status IN ('QUEUED','RUNNING','CANCELLING','CANCELLED','COMPLETED','FAILED'));
