-- Why automatic text extraction did not produce text, so the UI can explain
-- it in plain language. Additive and nullable: existing rows keep NULL.
CREATE TYPE "source_failure_reason" AS ENUM (
  'TOO_MANY_PAGES',
  'TOO_MANY_SCANNED_PAGES',
  'TEXT_TOO_LONG',
  'EMPTY',
  'OCR_UNAVAILABLE',
  'TRANSCRIPTION_UNAVAILABLE',
  'UNSUPPORTED_FORMAT',
  'UNREADABLE'
);

ALTER TABLE "source_details" ADD COLUMN "extraction_failure_reason" "source_failure_reason";
ALTER TABLE "source_processing_jobs" ADD COLUMN "failure_reason" "source_failure_reason";
