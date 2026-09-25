# Build: AI-Powered Lead Generation & Website Preview Platform

You are the lead senior software architect and developer for this project.

Build a production-ready SaaS/internal platform that automatically discovers potential business leads, identifies businesses with no website or poor/outdated websites, analyzes the business using an LLM, generates a personalized website preview from reusable templates, deploys the preview, and prepares personalized outreach.

The system will initially target restaurants, cafes, hotels, bars, gyms, salons, dentists, wedding/event venues, and similar local businesses in international markets.

The primary goal is to create a system where:

Lead discovered
→ business qualified
→ website status checked
→ business analyzed
→ website preview generated
→ preview deployed
→ personalized outreach drafted
→ human approval / compliant sending
→ track response
→ convert lead into customer

Do NOT build a spam system. Build a compliant outbound-sales platform with rate limits, opt-out handling, suppression lists, audit logs, and configurable human approval before outreach.

---

# 1. TECH STACK

Use the following stack unless there is a strong technical reason not to.

## Frontend

* Next.js
* TypeScript
* React
* Tailwind CSS
* shadcn/ui
* Responsive dashboard
* Server-side rendering where appropriate

## Backend

Use Next.js API routes/server actions OR a separate backend if architectural separation is clearly beneficial.

Preferred:

* Next.js
* TypeScript
* REST API where appropriate
* Background jobs handled separately from request/response lifecycle

## Database

PostgreSQL.

Use:

* Prisma ORM
* PostgreSQL migrations
* Proper foreign keys
* Indexes
* UUID primary keys
* created_at / updated_at timestamps

The application MUST work with a normal PostgreSQL connection string:

DATABASE_URL=postgresql://...

Do not use SQLite.

## Background jobs

Use a reliable queue architecture.

Preferred:

* Redis
* BullMQ

Jobs should include:

* lead discovery
* lead enrichment
* website checking
* website analysis
* AI generation
* preview generation
* deployment
* email drafting
* email sending
* follow-up scheduling

Never perform long-running operations directly inside an HTTP request.

## AI

Use an LLM provider through an abstraction layer.

Create:

AIProvider interface

so the system can support:

* Anthropic Claude
* OpenAI
* other providers later

Claude should be the primary provider.

The Claude API key must ONLY exist on the server.

Never expose API keys to the browser.

## Email

Create an EmailProvider abstraction.

Support a provider such as:

* Resend
* Amazon SES
* SendGrid

Do not hard-code the application to one provider.

## Deployment

The application must be deployable on a Linux VPS using Docker.

Provide:

* Dockerfile
* docker-compose.yml
* production environment configuration
* PostgreSQL connection
* Redis connection
* worker process
* web process

The system should work behind Nginx or Cloudflare.

---

# 2. CORE BUSINESS FLOW

Implement this workflow:

1. User creates a campaign.
2. User selects:

   * country
   * city/region
   * business category
   * maximum leads
3. Lead discovery runs.
4. System collects permitted business information from an approved data provider/API.
5. System checks whether the business has:

   * official website
   * usable website
   * outdated/poor website
   * no detectable website
6. System scores the lead.
7. Qualified leads are sent to AI analysis.
8. AI creates a business profile.
9. System selects an appropriate website template.
10. System customizes the template.
11. Preview website is generated.
12. Preview is deployed to a unique URL.
13. AI generates personalized outreach draft.
14. User reviews the draft.
15. User can approve, edit, reject, or suppress the lead.
16. Approved emails are sent through the configured email provider.
17. Email events are tracked where legally and technically appropriate.
18. Replies/statuses are tracked.
19. Follow-up tasks can be scheduled according to configurable rules.
20. Interested leads appear in the sales pipeline.

---

# 3. IMPORTANT COMPLIANCE REQUIREMENTS

Do not design this as an unrestricted mass-email tool.

Implement:

* global suppression list
* campaign suppression list
* unsubscribe status
* email consent/status fields
* do-not-contact flag
* bounced email suppression
* complaint suppression
* configurable sending limits
* per-domain sending limits
* daily campaign limits
* audit logs
* manual approval mode
* automatic sending mode must be explicitly enabled
* configurable follow-up limits
* configurable delay between emails

Never send an email to a lead marked:

do_not_contact=true

Never send to a globally suppressed email.

Never continue follow-ups after unsubscribe.

Do not fabricate facts about a business.

AI-generated claims must be based on actual collected data.

Do not claim that a business "doesn't have a website" unless the website-checking process actually determined that.

Create an outreach compliance configuration page where the administrator can configure:

* sender identity
* business address/footer
* unsubscribe mechanism
* maximum emails/day
* maximum emails/hour
* maximum follow-ups
* minimum delay
* approval requirement
* target countries

---

# 4. DATABASE DESIGN

Create a robust PostgreSQL schema.

Minimum entities:

## users

* id
* name
* email
* password_hash / authentication identifier
* role
* created_at
* updated_at

## campaigns

* id
* name
* category
* country
* region
* city
* status
* max_leads
* daily_email_limit
* auto_send_enabled
* created_at
* updated_at

## leads

* id
* campaign_id
* business_name
* category
* address
* city
* region
* country
* phone
* email
* website_url
* source
* source_external_id
* rating
* review_count
* description
* latitude
* longitude
* website_status
* lead_score
* status
* do_not_contact
* created_at
* updated_at

Possible website_status values:

* unknown
* no_website
* poor_website
* outdated
* good_website
* excellent_website
* unreachable

Possible lead status:

* discovered
* qualified
* rejected
* analyzing
* analyzed
* preview_generating
* preview_ready
* outreach_draft
* approved
* contacted
* replied
* interested
* not_interested
* converted
* suppressed

## lead_analysis

* id
* lead_id
* ai_provider
* model
* summary
* strengths
* weaknesses
* website_opportunity
* recommended_features
* target_audience
* suggested_ctas
* confidence
* raw_response
* created_at

## website_checks

* id
* lead_id
* url
* reachable
* status_code
* response_time
* ssl_valid
* mobile_friendly
* has_contact_information
* has_menu
* has_booking
* has_social_links
* has_clear_cta
* content_score
* design_score
* technical_score
* overall_score
* checked_at

## website_templates

* id
* name
* category
* description
* repository_path
* configuration_schema
* active
* created_at
* updated_at

## website_previews

* id
* lead_id
* template_id
* subdomain
* deployment_url
* deployment_provider
* deployment_status
* source_path
* generated_content
* created_at
* updated_at

## outreach_messages

* id
* lead_id
* campaign_id
* subject
* body
* provider
* status
* approved_by
* approved_at
* sent_at
* message_id
* created_at
* updated_at

## email_events

* id
* outreach_message_id
* event_type
* provider_event_id
* metadata
* occurred_at

Possible event types:

* sent
* delivered
* bounced
* complained
* opened
* clicked
* replied
* unsubscribed

## followups

* id
* lead_id
* previous_message_id
* sequence_number
* scheduled_at
* status
* created_at

## suppression_list

* id
* email
* reason
* source
* created_at

## jobs

* id
* type
* status
* payload
* attempts
* error
* started_at
* completed_at
* created_at

## audit_logs

* id
* user_id
* action
* entity_type
* entity_id
* metadata
* created_at

Add appropriate indexes.

Especially index:

* leads.email
* leads.country
* leads.city
* leads.category
* leads.website_status
* leads.status
* leads.lead_score
* campaigns.status
* suppression_list.email

---

# 5. LEAD DISCOVERY

Do not scrape websites blindly.

Create a LeadProvider abstraction:

interface LeadProvider {
searchBusinesses(...)
getBusiness(...)
}

The system should allow multiple providers.

Example provider architecture:

providers/
leads/
LeadProvider.ts
GooglePlacesProvider.ts
YelpProvider.ts
CustomProvider.ts

The exact provider should be configurable through environment variables.

The system should normalize all providers into the same Lead model.

Deduplicate using:

1. provider external ID
2. normalized business name + address
3. domain
4. email where available

---

# 6. WEBSITE DETECTION

For every lead, determine whether there is an official website.

Create a WebsiteAnalyzer service.

It should:

1. normalize URL
2. verify DNS/HTTP availability
3. follow redirects
4. check HTTPS
5. retrieve page metadata
6. inspect page structure
7. detect mobile viewport
8. identify important business information
9. detect obvious template/technical issues
10. calculate website score

Do not simply assume:

"No URL = no website."

Attempt reasonable verification where permitted.

Website score:

0-100

Example:

90-100 = excellent
75-89 = good
50-74 = needs improvement
25-49 = poor
0-24 = very poor

For no website:

website_status = no_website

For a poor website:

website_status = poor_website

Store the reasons.

---

# 7. AI BUSINESS ANALYSIS

Create:

services/ai/BusinessAnalyzer.ts

Input:

* business name
* category
* location
* description
* rating
* review count
* website information
* publicly available business information
* social links if legally/technically available

Ask Claude to return strict JSON.

Example schema:

{
"summary": "...",
"websiteOpportunity": "...",
"recommendedFeatures": [],
"recommendedSections": [],
"tone": "...",
"primaryCTA": "...",
"secondaryCTA": "...",
"targetAudience": "...",
"confidence": 0.0
}

Never allow the model to invent:

* prices
* services
* awards
* claims
* business history
* contact details

If information is unknown, return null or "unknown".

---

# 8. WEBSITE PREVIEW GENERATION

IMPORTANT:

Do not ask the LLM to generate an entire arbitrary website from scratch for every lead.

Create reusable, high-quality templates.

Initial templates:

1. restaurant
2. cafe
3. hotel
4. salon
5. gym
6. dentist
7. event venue
8. real estate
9. professional services

Each template should contain:

* hero
* navigation
* about
* services/menu
* gallery
* testimonials where valid data exists
* location
* contact
* CTA
* footer

The AI should generate a structured JSON configuration for the template.

Example:

{
"businessName": "...",
"headline": "...",
"subheadline": "...",
"primaryCTA": "...",
"sections": [],
"colors": {},
"fontPair": {},
"content": {}
}

The frontend template consumes this JSON.

This makes preview generation fast and predictable.

---

# 9. IMAGE HANDLING

Do not copy copyrighted images from random websites into generated previews.

Use:

* properly licensed stock images
* provider APIs with appropriate licenses
* user-provided images
* placeholders

Store image source and license metadata where applicable.

If the lead has publicly available images that cannot legally be reused, do not automatically copy them.

---

# 10. PREVIEW DEPLOYMENT

Every generated preview should receive a unique URL.

Example:

preview.example.com/marios-pizza

or

marios-pizza.preview.example.com

Create:

PreviewDeploymentService

with an abstraction so deployment can later support:

* Vercel
* Cloudflare Pages
* VPS
* Docker
* static hosting

For the first version, make VPS/Docker deployment easy.

The dashboard should display:

* deployment status
* preview URL
* created date
* last deployment
* template
* version

---

# 11. OUTREACH GENERATION

Claude should create personalized email drafts based ONLY on verified lead information.

Example structure:

Subject:
A quick website preview for {{business_name}}

Body:

Hi {{first_name_or_business_name}},

I came across {{business_name}} while researching {{category}} businesses in {{city}}.

I noticed {{verified_observation}}.

I put together a quick website concept to show what a modern online presence could look like for {{business_name}}:

{{preview_url}}

If you like the direction, I can turn the concept into a complete production website.

Best,
{{sender_name}}

Do not use fake personalization.

Do not say:

"I loved your restaurant."

unless the sender actually has a basis for saying this.

Avoid deceptive subject lines.

Provide configurable email templates.

---

# 12. EMAIL APPROVAL

The default behavior MUST be:

GENERATE → HUMAN REVIEW → SEND

Dashboard should show:

Lead
Business information
Website analysis
Preview
Email subject
Email body

Actions:

Approve & Send
Edit
Regenerate
Reject
Suppress

Only after approval should the system send the email.

Automatic sending should exist as an optional feature behind an explicit campaign setting.

---

# 13. EMAIL FOLLOW-UP

Create configurable sequences.

Example:

Day 0:
Initial email

Day 4:
Follow-up 1

Day 8:
Follow-up 2

Maximum:

3 messages

Stop sequence immediately if:

* reply detected
* unsubscribe
* bounce
* complaint
* do_not_contact

Never continue a sequence after an unsubscribe.

---

# 14. DASHBOARD

Build a polished SaaS-style dashboard.

Navigation:

Dashboard
Campaigns
Leads
Previews
Outreach
Follow-ups
Templates
Analytics
Suppression List
Settings
System Jobs

Dashboard cards:

* Total leads
* Qualified leads
* No website
* Poor websites
* Previews generated
* Emails sent
* Replies
* Interested leads
* Converted customers

Charts:

* leads by category
* leads by country
* website status
* outreach funnel
* campaign performance

---

# 15. LEAD DETAIL PAGE

Create a detailed lead page.

Show:

Business name
Category
Location
Phone
Email
Website
Rating
Reviews

Website analysis:

* website status
* score
* technical issues
* UX issues
* missing features

AI analysis:

* summary
* opportunity
* recommendations

Preview:

* iframe
* open preview
* regenerate
* deploy

Outreach:

* email draft
* approve
* edit
* regenerate
* send

Timeline:

* discovered
* analyzed
* preview generated
* email sent
* opened
* clicked
* replied
* follow-up
* status changes

---

# 16. CAMPAIGN CREATION

Create a campaign wizard.

Step 1:
Campaign name

Step 2:
Target country

Step 3:
Target city/region

Step 4:
Business category

Step 5:
Lead limit

Step 6:
Website criteria

Example:

[x] No website
[x] Poor website
[x] Outdated website

Step 7:
Preview generation

[x] Generate automatically

Step 8:
Outreach

[x] Generate drafts
[ ] Auto-send

Step 9:
Daily limit

Step 10:
Launch campaign

---

# 17. ADMIN SETTINGS

Create settings for:

AI provider
AI model
Lead provider
Email provider
Redis
Preview deployment
Default sender
Sending limits
Follow-up settings
Compliance settings

Never expose secrets in frontend responses.

Use environment variables.

---

# 18. ENVIRONMENT VARIABLES

Create `.env.example`.

Include:

DATABASE_URL=
REDIS_URL=

ANTHROPIC_API_KEY=

LEAD_PROVIDER=
LEAD_PROVIDER_API_KEY=

EMAIL_PROVIDER=
EMAIL_API_KEY=

EMAIL_FROM=
EMAIL_REPLY_TO=

PREVIEW_BASE_DOMAIN=

DEPLOYMENT_PROVIDER=
DEPLOYMENT_API_KEY=

NEXTAUTH_SECRET=

APP_URL=

Do not commit `.env`.

---

# 19. SECURITY

Implement:

* authentication
* authorization
* rate limiting
* CSRF protection where applicable
* input validation
* Zod schemas
* secure cookies
* server-side API keys
* SQL injection protection through Prisma
* XSS protection
* webhook signature validation
* audit logging

Validate all AI output before storing it.

Never trust LLM output as executable code.

---

# 20. OBSERVABILITY

Implement structured logging.

Every background job should log:

* job ID
* lead ID
* campaign ID
* action
* duration
* success/failure
* error

Create an admin jobs page.

Show:

* queued
* processing
* completed
* failed
* retry count

Implement exponential retry for transient failures.

---

# 21. AI COST CONTROL

Do not call Claude unnecessarily.

Use:

* caching
* deterministic checks before AI
* structured prompts
* smaller/cheaper models for simple classification
* stronger model only when needed

For example:

Website existence:
NO AI

Website HTTP check:
NO AI

Basic website score:
CODE

Business classification:
SMALL AI MODEL

Personalized analysis:
CLAUDE

Email generation:
CLAUDE

This keeps operating costs low.

---

# 22. IMPORTANT ARCHITECTURE PRINCIPLE

The system should be modular.

Use:

/app
/components
/lib
/services
/providers
/workers
/prisma
/templates
/prompts
/types

Example:

services/
lead-discovery/
website-analysis/
ai-analysis/
preview-generation/
deployment/
outreach/
email/
compliance/

providers/
leads/
ai/
email/
deployment/

workers/
leadDiscoveryWorker.ts
websiteAnalysisWorker.ts
aiAnalysisWorker.ts
previewWorker.ts
outreachWorker.ts
followupWorker.ts

prompts/
business-analysis.ts
website-content.ts
outreach.ts

---

# 23. API DESIGN

Create clean APIs.

Examples:

POST /api/campaigns

GET /api/campaigns

GET /api/campaigns/:id

POST /api/campaigns/:id/start

POST /api/campaigns/:id/pause

GET /api/leads

GET /api/leads/:id

POST /api/leads/:id/analyze

POST /api/leads/:id/generate-preview

POST /api/leads/:id/generate-outreach

POST /api/leads/:id/approve-outreach

POST /api/leads/:id/suppress

POST /api/previews/:id/deploy

GET /api/analytics

POST /api/webhooks/email

---

# 24. TESTING

Write tests for:

* lead deduplication
* website detection
* website scoring
* AI JSON validation
* email generation
* suppression rules
* unsubscribe handling
* follow-up stopping
* campaign limits
* rate limiting
* webhook validation

Create integration tests for the major workflow.

---

# 25. SEED DATA

Create realistic seed data.

Include:

10 restaurants
5 cafes
5 hotels
5 salons
5 gyms

Create several website statuses:

* no website
* poor
* outdated
* good

Create sample campaigns.

Create sample preview configurations.

---

# 26. LOCAL DEVELOPMENT

Provide:

docker-compose.yml

Services:

postgres
redis
app
worker

One command should start the development environment.

Example:

docker compose up -d

Then:

pnpm install

pnpm dev

Provide clear README instructions.

---

# 27. PRODUCTION DEPLOYMENT

Provide Docker production configuration.

Separate:

web
worker

Use the same PostgreSQL database and Redis instance.

The worker must continue processing jobs even if the web application restarts.

Provide:

docker-compose.production.yml

Include health checks.

---

# 28. FIRST MVP PRIORITY

Do NOT attempt to build every possible feature before getting the core workflow working.

Implement in this order:

PHASE 1

1. PostgreSQL
2. Prisma
3. Authentication
4. Campaigns
5. Leads
6. Lead provider abstraction
7. Website checker
8. Lead scoring
9. Dashboard

PHASE 2

10. Claude integration
11. Business analysis
12. Template system
13. Preview generation
14. Preview deployment

PHASE 3

15. Email provider
16. Outreach generation
17. Human approval
18. Email sending
19. Suppression
20. Follow-ups

PHASE 4

21. Analytics
22. Advanced automation
23. Multiple lead providers
24. Multiple AI providers
25. Multiple deployment providers

---

# 29. DEVELOPMENT RULES

Do not create fake implementations where real functionality is expected.

If an external API key is unavailable, create a clean provider interface and a development/mock provider, but make production implementation straightforward.

Do not hard-code API keys.

Do not hard-code business data.

Do not use SQLite.

Do not use local JSON as the primary database.

Do not put long-running work inside HTTP requests.

Do not generate arbitrary executable code from AI.

Do not automatically send mass email by default.

Do not create deceptive outreach.

Do not fabricate business information.

Use TypeScript strictly.

Use ESLint.

Use Prettier.

Use Zod for validation.

Use Prisma migrations.

Use proper error handling.

---

# 30. WHAT I WANT YOU TO DO NOW

Start by inspecting the current repository.

If a project already exists:

1. Understand the existing architecture.
2. Preserve useful existing code.
3. Do not rewrite working functionality unnecessarily.
4. Identify missing infrastructure.

If the repository is empty:

1. Initialize the project.
2. Set up Next.js + TypeScript.
3. Set up PostgreSQL + Prisma.
4. Set up Redis + BullMQ.
5. Set up authentication.
6. Create the database schema.
7. Create the dashboard shell.
8. Implement the Campaign and Lead modules.
9. Implement the first lead provider abstraction.
10. Implement website checking.
11. Implement the first background workers.

Then continue through the phases above.

After each major phase:

* run tests
* run TypeScript checks
* run lint
* fix errors
* update README
* verify database migrations
* verify Docker setup

Do not stop after generating a plan.

Actually implement the application.

When you encounter a design decision, choose a sensible production-ready default and continue rather than repeatedly asking me questions.

At the end, provide:

1. What was implemented
2. Database schema summary
3. Environment variables required
4. How to run locally
5. How to run with Docker
6. How to deploy to a VPS
7. Remaining TODOs
8. Estimated external API costs
9. Security/compliance considerations

The final result should be a real working MVP, not a mockup.

