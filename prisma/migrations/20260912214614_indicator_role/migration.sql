-- CreateEnum
CREATE TYPE "IndicatorRole" AS ENUM ('SCORED', 'DISPLAY_ONLY', 'INPUT');

-- AlterTable
ALTER TABLE "Indicator" ADD COLUMN     "role" "IndicatorRole" NOT NULL DEFAULT 'SCORED';
