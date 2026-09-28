-- CreateEnum
CREATE TYPE "mockup_device_type" AS ENUM ('DESKTOP', 'MOBILE');

-- AlterTable
ALTER TABLE "mockup_details" ADD COLUMN     "device_type" "mockup_device_type" NOT NULL DEFAULT 'DESKTOP';

-- AlterTable
ALTER TABLE "mockup_generation_jobs" ADD COLUMN     "device_type" "mockup_device_type" NOT NULL DEFAULT 'DESKTOP';
