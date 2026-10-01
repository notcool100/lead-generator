-- CreateEnum
CREATE TYPE "CallMode" AS ENUM ('off', 'manual', 'auto');

-- CreateEnum
CREATE TYPE "CallStatus" AS ENUM ('queued', 'registered', 'ongoing', 'ended', 'not_connected', 'error', 'cancelled');

-- CreateEnum
CREATE TYPE "CallOutcome" AS ENUM ('interested', 'not_interested', 'callback_requested', 'appointment_booked', 'wrong_number', 'no_answer', 'voicemail', 'do_not_contact', 'unknown');

-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN     "call_mode" "CallMode" NOT NULL DEFAULT 'off',
ADD COLUMN     "daily_call_limit" INTEGER NOT NULL DEFAULT 20;

-- AlterTable
ALTER TABLE "lead_analysis" ADD COLUMN     "opportunities" JSONB,
ADD COLUMN     "package_features" JSONB,
ADD COLUMN     "service_area" TEXT,
ADD COLUMN     "services" JSONB;

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "last_call_outcome" "CallOutcome",
ADD COLUMN     "last_called_at" TIMESTAMP(3),
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "score_factors" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "calls" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "campaign_id" UUID,
    "retell_call_id" TEXT,
    "twilio_call_sid" TEXT,
    "from_number" TEXT NOT NULL,
    "to_number" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "status" "CallStatus" NOT NULL DEFAULT 'queued',
    "outcome" "CallOutcome",
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "duration_ms" INTEGER,
    "disconnection_reason" TEXT,
    "transcript" TEXT,
    "transcript_object" JSONB,
    "recording_url" TEXT,
    "summary" TEXT,
    "sentiment" TEXT,
    "analysis" JSONB,
    "callback_note" TEXT,
    "cost_cents" DOUBLE PRECISION,
    "error" TEXT,
    "initiated_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "calls_retell_call_id_key" ON "calls"("retell_call_id");

-- CreateIndex
CREATE INDEX "calls_lead_id_created_at_idx" ON "calls"("lead_id", "created_at");

-- CreateIndex
CREATE INDEX "calls_campaign_id_created_at_idx" ON "calls"("campaign_id", "created_at");

-- CreateIndex
CREATE INDEX "calls_status_idx" ON "calls"("status");

-- CreateIndex
CREATE INDEX "calls_outcome_idx" ON "calls"("outcome");

-- AddForeignKey
ALTER TABLE "calls" ADD CONSTRAINT "calls_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calls" ADD CONSTRAINT "calls_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
