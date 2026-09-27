-- CreateEnum
CREATE TYPE "project_language" AS ENUM ('ES', 'EN');

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "language" "project_language" NOT NULL DEFAULT 'ES';
