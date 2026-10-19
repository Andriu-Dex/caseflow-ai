-- A person can cancel a batched generation; a new enum value cannot be used in the
-- transaction that adds it, so the CHECK constraints change in the next migration.
ALTER TYPE "source_processing_status" ADD VALUE IF NOT EXISTS 'CANCELLED';
