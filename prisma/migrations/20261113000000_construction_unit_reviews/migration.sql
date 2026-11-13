-- Review marks of construction units, by content hash (ADR-020).
CREATE TABLE "construction_unit_reviews" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "unit_key" TEXT NOT NULL,
    "content_sha256" CHAR(64) NOT NULL,
    "reviewed_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "construction_unit_reviews_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "construction_unit_reviews_project_id_unit_key_content_sha256_key"
    ON "construction_unit_reviews"("project_id", "unit_key", "content_sha256");

ALTER TABLE "construction_unit_reviews" ADD CONSTRAINT "construction_unit_reviews_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "construction_unit_reviews" ADD CONSTRAINT "construction_unit_reviews_reviewed_by_user_id_fkey"
    FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
