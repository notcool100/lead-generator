-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN     "lead_sources" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "source_url" TEXT,
ADD COLUMN     "source_verified" BOOLEAN,
ADD COLUMN     "sources" TEXT[] DEFAULT ARRAY[]::TEXT[];
