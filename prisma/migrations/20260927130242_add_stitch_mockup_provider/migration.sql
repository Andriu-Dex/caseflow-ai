-- CreateEnum
CREATE TYPE "mockup_generator_kind" AS ENUM ('INTERNAL_WIREFRAME', 'STITCH');

-- AlterTable
ALTER TABLE "mockup_details" ADD COLUMN     "generator_kind" "mockup_generator_kind" NOT NULL DEFAULT 'INTERNAL_WIREFRAME',
ALTER COLUMN "svg" DROP NOT NULL;

-- CreateTable
CREATE TABLE "mockup_screen_details" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "mockup_version_id" UUID NOT NULL,
    "screen_local_id" TEXT NOT NULL,
    "screen_name" TEXT NOT NULL,
    "image_storage_key" TEXT NOT NULL,
    "image_content_type" TEXT NOT NULL,
    "html_storage_key" TEXT NOT NULL,

    CONSTRAINT "mockup_screen_details_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mockup_screen_details_mockup_version_id_screen_local_id_key" ON "mockup_screen_details"("mockup_version_id", "screen_local_id");

-- AddForeignKey
ALTER TABLE "mockup_screen_details" ADD CONSTRAINT "mockup_screen_details_mockup_version_id_fkey" FOREIGN KEY ("mockup_version_id") REFERENCES "mockup_details"("artifact_version_id") ON DELETE RESTRICT ON UPDATE CASCADE;
