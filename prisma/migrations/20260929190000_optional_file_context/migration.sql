-- A file-backed source can be useful without user-entered content. Sources
-- without a file still require text so they cannot become empty knowledge.
ALTER TABLE "source_details" DROP CONSTRAINT "source_details_values";
ALTER TABLE "source_details" ADD CONSTRAINT "source_details_values" CHECK (
  btrim("purpose") <> ''
  AND (btrim("description") <> '' OR "storage_key" IS NOT NULL)
  AND ("business_area" IS NULL OR btrim("business_area") <> '')
  AND ("language" IS NULL OR btrim("language") <> '')
  AND (
    (
      "original_filename" IS NOT NULL AND btrim("original_filename") <> ''
      AND "mime_type" IS NOT NULL AND btrim("mime_type") <> ''
      AND "size_bytes" IS NOT NULL AND "size_bytes" > 0
      AND "content_hash" IS NOT NULL AND btrim("content_hash") <> ''
      AND "storage_key" IS NOT NULL AND btrim("storage_key") <> ''
    )
    OR
    (
      "original_filename" IS NULL AND "mime_type" IS NULL
      AND "size_bytes" IS NULL AND "content_hash" IS NULL AND "storage_key" IS NULL
    )
  )
  AND (("extraction_state" IN ('EXTRACTED', 'MANUAL')) =
    ("extracted_text" IS NOT NULL AND btrim("extracted_text") <> ''))
);
