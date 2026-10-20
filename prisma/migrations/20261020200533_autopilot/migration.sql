-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN     "autopilot" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "research_notes" TEXT;
