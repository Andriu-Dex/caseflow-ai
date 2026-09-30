ALTER TABLE "sessions" ADD COLUMN "token_id" TEXT;

-- Existing refresh sessions predate token selectors and their raw tokens are
-- intentionally unrecoverable. Random selectors force those clients to sign in again.
UPDATE "sessions" SET "token_id" = "id"::text WHERE "token_id" IS NULL;
UPDATE "sessions" SET "revoked_at" = CURRENT_TIMESTAMP WHERE "revoked_at" IS NULL;
ALTER TABLE "sessions" ALTER COLUMN "token_id" SET NOT NULL;
CREATE UNIQUE INDEX "sessions_token_id_key" ON "sessions"("token_id");
CREATE INDEX "sessions_revoked_at_expires_at_idx" ON "sessions"("revoked_at", "expires_at");
