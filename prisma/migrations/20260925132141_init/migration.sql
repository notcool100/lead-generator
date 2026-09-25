-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'operator', 'viewer');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('draft', 'running', 'paused', 'completed', 'archived');

-- CreateEnum
CREATE TYPE "WebsiteStatus" AS ENUM ('unknown', 'no_website', 'poor_website', 'outdated', 'good_website', 'excellent_website', 'unreachable');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('discovered', 'qualified', 'rejected', 'analyzing', 'analyzed', 'preview_generating', 'preview_ready', 'outreach_draft', 'approved', 'contacted', 'replied', 'interested', 'not_interested', 'converted', 'suppressed');

-- CreateEnum
CREATE TYPE "DeploymentStatus" AS ENUM ('pending', 'building', 'deployed', 'failed');

-- CreateEnum
CREATE TYPE "OutreachStatus" AS ENUM ('draft', 'approved', 'queued', 'sent', 'failed', 'rejected', 'cancelled');

-- CreateEnum
CREATE TYPE "EmailEventType" AS ENUM ('sent', 'delivered', 'bounced', 'complained', 'opened', 'clicked', 'replied', 'unsubscribed');

-- CreateEnum
CREATE TYPE "FollowupStatus" AS ENUM ('scheduled', 'drafted', 'sent', 'cancelled', 'skipped');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('queued', 'processing', 'completed', 'failed');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'operator',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "region" TEXT,
    "city" TEXT,
    "status" "CampaignStatus" NOT NULL DEFAULT 'draft',
    "max_leads" INTEGER NOT NULL DEFAULT 50,
    "daily_email_limit" INTEGER NOT NULL DEFAULT 20,
    "auto_send_enabled" BOOLEAN NOT NULL DEFAULT false,
    "auto_generate_preview" BOOLEAN NOT NULL DEFAULT true,
    "auto_generate_drafts" BOOLEAN NOT NULL DEFAULT true,
    "target_website_statuses" "WebsiteStatus"[] DEFAULT ARRAY['no_website', 'poor_website', 'outdated']::"WebsiteStatus"[],
    "min_lead_score" INTEGER NOT NULL DEFAULT 50,
    "created_by_id" UUID,
    "started_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" UUID NOT NULL,
    "campaign_id" UUID,
    "business_name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "address" TEXT,
    "normalized_address" TEXT,
    "city" TEXT,
    "region" TEXT,
    "country" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "website_url" TEXT,
    "domain" TEXT,
    "source" TEXT NOT NULL,
    "source_external_id" TEXT,
    "rating" DOUBLE PRECISION,
    "review_count" INTEGER,
    "description" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "social_links" JSONB,
    "website_status" "WebsiteStatus" NOT NULL DEFAULT 'unknown',
    "website_status_reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lead_score" INTEGER NOT NULL DEFAULT 0,
    "status" "LeadStatus" NOT NULL DEFAULT 'discovered',
    "do_not_contact" BOOLEAN NOT NULL DEFAULT false,
    "unsubscribed" BOOLEAN NOT NULL DEFAULT false,
    "email_consent_status" TEXT NOT NULL DEFAULT 'unknown',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_events" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_analysis" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "ai_provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "strengths" JSONB NOT NULL,
    "weaknesses" JSONB NOT NULL,
    "website_opportunity" TEXT NOT NULL,
    "recommended_features" JSONB NOT NULL,
    "recommended_sections" JSONB,
    "tone" TEXT,
    "target_audience" TEXT,
    "suggested_ctas" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "input_hash" TEXT,
    "raw_response" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_analysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "website_checks" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "url" TEXT,
    "final_url" TEXT,
    "reachable" BOOLEAN NOT NULL,
    "status_code" INTEGER,
    "response_time" INTEGER,
    "ssl_valid" BOOLEAN,
    "mobile_friendly" BOOLEAN,
    "has_contact_information" BOOLEAN,
    "has_menu" BOOLEAN,
    "has_booking" BOOLEAN,
    "has_social_links" BOOLEAN,
    "has_clear_cta" BOOLEAN,
    "content_score" INTEGER,
    "design_score" INTEGER,
    "technical_score" INTEGER,
    "overall_score" INTEGER,
    "website_status" "WebsiteStatus" NOT NULL,
    "reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "metadata" JSONB,
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "website_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "website_templates" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "repository_path" TEXT NOT NULL,
    "configuration_schema" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "website_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "website_previews" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "subdomain" TEXT NOT NULL,
    "deployment_url" TEXT,
    "deployment_provider" TEXT NOT NULL,
    "deployment_status" "DeploymentStatus" NOT NULL DEFAULT 'pending',
    "source_path" TEXT,
    "generated_content" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "last_deployed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "website_previews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outreach_messages" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "campaign_id" UUID,
    "sequence_number" INTEGER NOT NULL DEFAULT 0,
    "to_email" TEXT,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "provider" TEXT,
    "status" "OutreachStatus" NOT NULL DEFAULT 'draft',
    "approved_by" UUID,
    "approved_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "message_id" TEXT,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outreach_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_events" (
    "id" UUID NOT NULL,
    "outreach_message_id" UUID NOT NULL,
    "event_type" "EmailEventType" NOT NULL,
    "provider_event_id" TEXT,
    "metadata" JSONB,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "followups" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "previous_message_id" UUID NOT NULL,
    "sequence_number" INTEGER NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "status" "FollowupStatus" NOT NULL DEFAULT 'scheduled',
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "followups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppression_list" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suppression_list_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_suppressions" (
    "id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_suppressions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" UUID NOT NULL,
    "queue_job_id" TEXT,
    "type" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'queued',
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "lead_id" UUID,
    "campaign_id" UUID,
    "duration_ms" INTEGER,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ai_cache" (
    "key" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_cache_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "campaigns_status_idx" ON "campaigns"("status");

-- CreateIndex
CREATE INDEX "campaigns_category_idx" ON "campaigns"("category");

-- CreateIndex
CREATE INDEX "campaigns_country_idx" ON "campaigns"("country");

-- CreateIndex
CREATE INDEX "leads_email_idx" ON "leads"("email");

-- CreateIndex
CREATE INDEX "leads_country_idx" ON "leads"("country");

-- CreateIndex
CREATE INDEX "leads_city_idx" ON "leads"("city");

-- CreateIndex
CREATE INDEX "leads_category_idx" ON "leads"("category");

-- CreateIndex
CREATE INDEX "leads_website_status_idx" ON "leads"("website_status");

-- CreateIndex
CREATE INDEX "leads_status_idx" ON "leads"("status");

-- CreateIndex
CREATE INDEX "leads_lead_score_idx" ON "leads"("lead_score");

-- CreateIndex
CREATE INDEX "leads_campaign_id_idx" ON "leads"("campaign_id");

-- CreateIndex
CREATE INDEX "leads_domain_idx" ON "leads"("domain");

-- CreateIndex
CREATE INDEX "leads_normalized_name_normalized_address_idx" ON "leads"("normalized_name", "normalized_address");

-- CreateIndex
CREATE UNIQUE INDEX "leads_source_source_external_id_key" ON "leads"("source", "source_external_id");

-- CreateIndex
CREATE INDEX "lead_events_lead_id_created_at_idx" ON "lead_events"("lead_id", "created_at");

-- CreateIndex
CREATE INDEX "lead_analysis_lead_id_idx" ON "lead_analysis"("lead_id");

-- CreateIndex
CREATE INDEX "lead_analysis_input_hash_idx" ON "lead_analysis"("input_hash");

-- CreateIndex
CREATE INDEX "website_checks_lead_id_checked_at_idx" ON "website_checks"("lead_id", "checked_at");

-- CreateIndex
CREATE UNIQUE INDEX "website_templates_key_key" ON "website_templates"("key");

-- CreateIndex
CREATE INDEX "website_templates_category_idx" ON "website_templates"("category");

-- CreateIndex
CREATE UNIQUE INDEX "website_previews_subdomain_key" ON "website_previews"("subdomain");

-- CreateIndex
CREATE INDEX "website_previews_lead_id_idx" ON "website_previews"("lead_id");

-- CreateIndex
CREATE INDEX "website_previews_deployment_status_idx" ON "website_previews"("deployment_status");

-- CreateIndex
CREATE INDEX "outreach_messages_lead_id_idx" ON "outreach_messages"("lead_id");

-- CreateIndex
CREATE INDEX "outreach_messages_campaign_id_sent_at_idx" ON "outreach_messages"("campaign_id", "sent_at");

-- CreateIndex
CREATE INDEX "outreach_messages_status_idx" ON "outreach_messages"("status");

-- CreateIndex
CREATE INDEX "outreach_messages_message_id_idx" ON "outreach_messages"("message_id");

-- CreateIndex
CREATE UNIQUE INDEX "email_events_provider_event_id_key" ON "email_events"("provider_event_id");

-- CreateIndex
CREATE INDEX "email_events_outreach_message_id_idx" ON "email_events"("outreach_message_id");

-- CreateIndex
CREATE INDEX "email_events_event_type_idx" ON "email_events"("event_type");

-- CreateIndex
CREATE INDEX "followups_status_scheduled_at_idx" ON "followups"("status", "scheduled_at");

-- CreateIndex
CREATE INDEX "followups_lead_id_idx" ON "followups"("lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "suppression_list_email_key" ON "suppression_list"("email");

-- CreateIndex
CREATE INDEX "suppression_list_email_idx" ON "suppression_list"("email");

-- CreateIndex
CREATE INDEX "campaign_suppressions_email_idx" ON "campaign_suppressions"("email");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_suppressions_campaign_id_email_key" ON "campaign_suppressions"("campaign_id", "email");

-- CreateIndex
CREATE INDEX "jobs_status_created_at_idx" ON "jobs"("status", "created_at");

-- CreateIndex
CREATE INDEX "jobs_type_idx" ON "jobs"("type");

-- CreateIndex
CREATE INDEX "jobs_lead_id_idx" ON "jobs"("lead_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_events" ADD CONSTRAINT "lead_events_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_analysis" ADD CONSTRAINT "lead_analysis_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "website_checks" ADD CONSTRAINT "website_checks_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "website_previews" ADD CONSTRAINT "website_previews_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "website_previews" ADD CONSTRAINT "website_previews_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "website_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_messages" ADD CONSTRAINT "outreach_messages_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_messages" ADD CONSTRAINT "outreach_messages_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_messages" ADD CONSTRAINT "outreach_messages_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_outreach_message_id_fkey" FOREIGN KEY ("outreach_message_id") REFERENCES "outreach_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "followups" ADD CONSTRAINT "followups_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "followups" ADD CONSTRAINT "followups_previous_message_id_fkey" FOREIGN KEY ("previous_message_id") REFERENCES "outreach_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_suppressions" ADD CONSTRAINT "campaign_suppressions_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
