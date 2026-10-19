-- Batched generation jobs may end CANCELLED (the finished batches are kept).
ALTER TABLE "requirement_generation_jobs" DROP CONSTRAINT "requirement_generation_jobs_status_check";
ALTER TABLE "requirement_generation_jobs" ADD CONSTRAINT "requirement_generation_jobs_status_check" CHECK (status IN ('QUEUED','RUNNING','COMPLETED','FAILED','CANCELLED'));
ALTER TABLE "use_case_generation_jobs" DROP CONSTRAINT "use_case_generation_jobs_status_check";
ALTER TABLE "use_case_generation_jobs" ADD CONSTRAINT "use_case_generation_jobs_status_check" CHECK (status IN ('QUEUED','RUNNING','COMPLETED','FAILED','CANCELLED'));
ALTER TABLE "structured_generation_jobs" DROP CONSTRAINT "structured_generation_jobs_status_check";
ALTER TABLE "structured_generation_jobs" ADD CONSTRAINT "structured_generation_jobs_status_check" CHECK (status IN ('QUEUED','RUNNING','COMPLETED','FAILED','CANCELLED'));
ALTER TABLE "data_model_generation_jobs" DROP CONSTRAINT "data_model_generation_jobs_status_check";
ALTER TABLE "data_model_generation_jobs" ADD CONSTRAINT "data_model_generation_jobs_status_check" CHECK (status IN ('QUEUED','RUNNING','COMPLETED','FAILED','CANCELLED'));
