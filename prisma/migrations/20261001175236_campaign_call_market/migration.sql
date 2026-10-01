-- CreateEnum
CREATE TYPE "CallMarket" AS ENUM ('us', 'au', 'uk', 'nz');

-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN     "call_market" "CallMarket" NOT NULL DEFAULT 'us',
ADD COLUMN     "call_timezone" TEXT,
ADD COLUMN     "call_voice_id" TEXT,
ADD COLUMN     "dnc_checked_at" TIMESTAMP(3);
