ALTER TABLE user_manual_captures DROP CONSTRAINT manual_capture_image;
ALTER TABLE user_manual_captures ADD CONSTRAINT manual_capture_image CHECK (
 (status='CAPTURED' AND storage_key IS NOT NULL AND sha256 IS NOT NULL
  AND sha256 ~ '^[a-f0-9]{64}$' AND width IS NOT NULL AND height IS NOT NULL
  AND width=1440 AND height=900 AND reason IS NULL)
 OR (status<>'CAPTURED' AND storage_key IS NULL AND sha256 IS NULL
  AND width IS NULL AND height IS NULL AND reason IS NOT NULL)
);
