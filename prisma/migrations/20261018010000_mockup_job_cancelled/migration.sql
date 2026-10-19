-- A person can cancel a mockup generation; the drawn screens are kept.
ALTER TYPE "mockup_job_status" ADD VALUE IF NOT EXISTS 'CANCELLED';
