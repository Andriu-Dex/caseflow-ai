-- Sources: file upload becomes optional; typed content becomes mandatory
-- (spec: a source's knowledge can come from typed content alone, mirroring
-- the existing manual-transcript mechanism).

-- Backfill existing NULL descriptions before tightening the NOT NULL
-- constraint. The immutability trigger normally blocks UPDATE on this
-- table unconditionally; it is disabled for this one deploy-time backfill
-- statement only (never by application code) and re-enabled immediately.
ALTER TABLE "source_details" DISABLE TRIGGER "source_details_enforce_immutability";
UPDATE "source_details" SET "description" = '(sin descripción registrada)' WHERE "description" IS NULL OR btrim("description") = '';
ALTER TABLE "source_details" ENABLE TRIGGER "source_details_enforce_immutability";

ALTER TABLE "source_details"
  ALTER COLUMN "description" SET NOT NULL,
  ALTER COLUMN "original_filename" DROP NOT NULL,
  ALTER COLUMN "mime_type" DROP NOT NULL,
  ALTER COLUMN "size_bytes" DROP NOT NULL,
  ALTER COLUMN "content_hash" DROP NOT NULL,
  ALTER COLUMN "storage_key" DROP NOT NULL;

-- Replace the CHECK constraint: file fields are now all-present-or-all-null
-- (a file is optional, but partial file metadata is never valid), and
-- description is always required instead of optional.
ALTER TABLE "source_details" DROP CONSTRAINT "source_details_values";
ALTER TABLE "source_details" ADD CONSTRAINT "source_details_values" CHECK (
  btrim("purpose")<>'' AND btrim("description")<>''
  AND ("business_area" IS NULL OR btrim("business_area")<>'')
  AND ("language" IS NULL OR btrim("language")<>'')
  AND (
    (
      "original_filename" IS NOT NULL AND btrim("original_filename")<>''
      AND "mime_type" IS NOT NULL AND btrim("mime_type")<>''
      AND "size_bytes" IS NOT NULL AND "size_bytes">0
      AND "content_hash" IS NOT NULL AND btrim("content_hash")<>''
      AND "storage_key" IS NOT NULL AND btrim("storage_key")<>''
    )
    OR
    (
      "original_filename" IS NULL AND "mime_type" IS NULL
      AND "size_bytes" IS NULL AND "content_hash" IS NULL AND "storage_key" IS NULL
    )
  )
  AND (("extraction_state" IN ('EXTRACTED','MANUAL')) = ("extracted_text" IS NOT NULL AND btrim("extracted_text")<>''))
);
