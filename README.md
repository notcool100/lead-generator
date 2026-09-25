# AI Lead Generation & Website Preview System

A compliant outbound-sales platform for local businesses:

```
campaign → lead discovery → website check → lead scoring → AI analysis (Claude)
        → template-based website preview → deploy to unique URL
        → personalised outreach draft → HUMAN APPROVAL → rate-limited send
        → webhooks (delivered / bounced / replied / unsubscribed) → follow-ups → pipeline
```

It is deliberately **not** a mass-mailer: approval is on by default, every send re-checks
suppression lists, do-not-contact flags and hourly/daily/per-domain/per-campaign limits,
and every AI claim must come from verified data.

---

## Stack

| Layer      | Choice |
|------------|--------|
| Web        | Next.js 16 (App Router, `proxy.ts`), React 19, TypeScript (strict), Tailwind v4, shadcn-style UI components, Recharts |
| API        | Next.js route handlers (REST), Zod validation |
| DB         | PostgreSQL + Prisma 7 (driver adapter `@prisma/adapter-pg`), SQL migrations |
| Jobs       | Redis + BullMQ — separate `worker` process |
| AI         | `AIProvider` abstraction — Anthropic Claude (primary, structured outputs), OpenAI, offline mock |
| Email      | `EmailProvider` abstraction — Resend, SendGrid, Amazon SES, log (dev) |
| Leads      | `LeadProvider` abstraction — Google Places (New), Yelp Fusion, mock (dev) |
| Previews   | `DeploymentProvider` abstraction — VPS/static files, Vercel |
| Auth       | Email/password (bcrypt) + signed JWT session cookie (HttpOnly, SameSite=Lax), roles admin/operator/viewer |
| Tests      | Vitest — unit + PostgreSQL integration test |

## Project layout

```
app/                    Next.js routes
  (dashboard)/          Dashboard, Campaigns (+wizard), Leads (+detail), Previews, Outreach,
                        Follow-ups, Templates, Analytics, Suppression List, Settings, System Jobs
  api/                  REST API (see "API")
  p/[slug]/             Public preview pages
  unsubscribe/[token]/  Unsubscribe confirmation page
  mock-sites/           Dev-only sample websites used by the mock lead provider
components/             UI (components/ui = shadcn-style primitives)
lib/                    db, env, auth, logger, redis, rate limiting, API helpers, validation
providers/              leads/ ai/ email/ deployment/   (pluggable integrations)
services/               lead-discovery/ website-analysis/ scoring/ ai-analysis/
                        preview-generation/ deployment/ outreach/ email/ compliance/ followups/
prompts/                business-analysis.ts website-content.ts outreach.ts
templates/              registry.ts (9 templates) + render.ts (config → static HTML)
workers/                one file per queue + index.ts entrypoint
queue/                  BullMQ queues + enqueue helper (mirrors jobs into the `jobs` table)
prisma/                 schema.prisma, migrations/, seed.ts
tests/                  unit/ integration/
```

---

## Run locally

Requirements: Node 22+, pnpm, PostgreSQL 14+, Redis 6+.

```bash
cp .env.example .env              # then edit DATABASE_URL, NEXTAUTH_SECRET, …
# or start infra with Docker:  docker compose up -d postgres redis

pnpm install                       # also runs `prisma generate`
pnpm db:migrate                    # apply migrations (dev)
pnpm db:seed                       # admin user + 9 templates + sample campaigns/leads/previews

pnpm dev                           # web  → http://localhost:3000
pnpm worker                        # background workers (second terminal) — REQUIRED for pipelines
```

Sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env` (defaults in `.env.example`).

With no API keys the whole pipeline still runs: `LEAD_PROVIDER=mock` produces clearly
synthetic businesses (`.example` domains), the AI layer falls back to a deterministic
fact-only generator, and `EMAIL_PROVIDER=log` logs instead of sending.
Set `ANTHROPIC_API_KEY` to use Claude.

### Tests & checks

```bash
pnpm typecheck
pnpm lint
pnpm test:unit
# integration test needs its own database:
createdb ai_lead_test
DATABASE_URL=postgresql://…/ai_lead_test pnpm db:deploy
TEST_DATABASE_URL=postgresql://…/ai_lead_test pnpm test:integration
```

---

## Environment variables

See `.env.example` for the complete list.

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | ✅ | `postgresql://user:pass@host:5432/ai_lead` |
| `REDIS_URL` | ✅ | `redis://host:6379` |
| `APP_URL` | ✅ | Public base URL (used in preview + unsubscribe links) |
| `NEXTAUTH_SECRET` | ✅ | ≥16 chars; signs sessions and unsubscribe tokens (`openssl rand -base64 32`) |
| `AI_PROVIDER` | | `claude_code` (default — uses your Claude subscription through the logged-in `claude` CLI on this machine; `CLAUDE_CODE_MODEL`/`CLAUDE_CODE_SMALL_MODEL`) \| `anthropic` (API key; required on servers/Docker) \| `openai` \| `mock` |
| `ANTHROPIC_API_KEY` | prod | Server-side only; never sent to the browser |
| `AI_MODEL` / `AI_SMALL_MODEL` | | Default `claude-opus-5` (analysis & copy) / `claude-haiku-4-5` (classification) |
| `LEAD_PROVIDER` | | Default sources, comma-separated: `google_places`, `openstreetmap` (free, no key), `web_search` (Claude web search — Maps listings, directories, review & social pages; needs `claude_code`), `yelp`, `mock`. Each campaign can pick its own sources in the wizard; results are merged and de-duplicated. |
| `GOOGLE_PLACES_API_KEY`, `YELP_API_KEY` | | Keys for Google Maps (Places API New) and Yelp Fusion |
| `DISCOVERY_BATCH_SIZE` | | New leads per discovery run (default 20). Launch fetches the first batch; "Discover next 20" continues from a saved cursor until the campaign's total is reached. |
| `OVERPASS_URLS`, `OSM_CONTACT` | | OpenStreetMap Overpass mirrors (tried in order) and contact for the OSM User-Agent |
| `EMAIL_PROVIDER`, `EMAIL_API_KEY` | prod | `resend` \| `sendgrid` \| `ses` \| `log`. SES uses `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` |
| `EMAIL_FROM`, `EMAIL_REPLY_TO` | | Fallback sender (Settings → Compliance overrides) |
| `EMAIL_WEBHOOK_SECRET` | prod | Verifies `POST /api/webhooks/email` (Svix `whsec_…` for Resend, or HMAC secret) |
| `PREVIEW_BASE_DOMAIN` | | If set, previews are served at `https://<slug>.<domain>`; otherwise `APP_URL/p/<slug>` |
| `DEPLOYMENT_PROVIDER`, `DEPLOYMENT_API_KEY` | | `vps` (default) \| `vercel` (+ optional `VERCEL_TEAM_ID`) |
| `PREVIEW_OUTPUT_DIR` | | Where the VPS provider writes static previews |
| `UNSPLASH_ACCESS_KEY` | | Optional licensed stock photos; otherwise styled placeholders |

---

## Run with Docker

```bash
# infra only (recommended for development)
docker compose up -d postgres redis

# everything, built from the Dockerfile (web + worker)
docker compose --profile app up -d --build
```

## Deploy to a VPS

1. Install Docker + the compose plugin, point DNS at the server (`app.example.com`, and
   `*.preview.example.com` if you want subdomain previews).
2. Copy the repo, create `.env.production` from `.env.example` (real keys, `NODE_ENV=production`,
   `APP_URL=https://app.example.com`, `PREVIEW_BASE_DOMAIN=preview.example.com`) and export
   `POSTGRES_PASSWORD`.
3. `docker compose -f docker-compose.production.yml up -d --build`
   - `migrate` runs `prisma migrate deploy` once, then `web` and `worker` start.
   - `worker` is a separate container; web restarts never interrupt jobs.
   - Health checks: `GET /api/health` (web, checks DB + Redis) and `:3001/` (worker).
4. Put Nginx (see `deploy/nginx.conf`), Caddy or Cloudflare in front of `127.0.0.1:3000`
   and terminate TLS there. Preview subdomains are rewritten to `/p/<slug>` by `proxy.ts`.
5. Create your admin: `docker compose -f docker-compose.production.yml run --rm web pnpm db:seed`
   (seeds sample data too — delete the `[Sample]` campaigns afterwards), then change the password.
6. Configure your email provider's webhook to `https://app.example.com/api/webhooks/email`.

---

## Database schema (summary)

| Table | Purpose |
|---|---|
| `users` | Auth + roles |
| `campaigns` | Target category/location, limits, website criteria, auto-preview/draft/send switches |
| `leads` | Normalised business, dedupe keys (`normalized_name`, `normalized_address`, `domain`), website status + reasons, score, pipeline status, `do_not_contact`, `unsubscribed` |
| `lead_events` | Timeline shown on the lead page |
| `website_checks` | Every deterministic website check (HTTP/SSL/mobile/CTA/… + scores + reasons) |
| `lead_analysis` | Validated Claude output + raw response + input hash |
| `website_templates` | 9 registered templates |
| `website_previews` | Generated config JSON, unique subdomain/slug, deployment status/URL/version |
| `outreach_messages` | Drafts/approved/sent emails, approver, provider message id |
| `email_events` | sent/delivered/bounced/complained/opened/clicked/replied/unsubscribed (idempotent on provider event id) |
| `followups` | Scheduled sequence steps |
| `suppression_list`, `campaign_suppressions` | Global + per-campaign suppression |
| `jobs` | Mirror of every background job (status, attempts, duration, error) |
| `audit_logs` | Who did what |
| `settings`, `ai_cache` | Admin settings (non-secret) and AI response cache |

All tables use UUID PKs, FKs and the indexes requested in the spec (`leads.email/country/city/category/website_status/status/lead_score`, `campaigns.status`, `suppression_list.email`, …).

## API

```
POST /api/auth/login               POST /api/auth/logout
GET|POST /api/campaigns            GET|PATCH /api/campaigns/:id
POST /api/campaigns/:id/start      POST /api/campaigns/:id/pause
GET /api/leads                     GET /api/leads/:id
POST /api/leads/:id/check-website  POST /api/leads/:id/analyze
POST /api/leads/:id/generate-preview
POST /api/leads/:id/generate-outreach
POST /api/leads/:id/approve-outreach   { messageId, subject?, body? }
POST /api/leads/:id/suppress       POST /api/leads/:id/status
PATCH /api/outreach/:id            POST /api/outreach/:id/reject
POST /api/previews/:id/deploy
GET /api/analytics                 GET|PUT /api/settings
GET|POST|DELETE /api/suppression   POST /api/jobs/retry
POST /api/webhooks/email           POST /api/unsubscribe?token=…   GET /api/health
```

Webhook formats: Resend (Svix-signed), or the normalised form
`{ "type": "bounced|complained|replied|…", "providerMessageId" | "outreachMessageId", "email"?, "providerEventId"? }`
signed with `x-webhook-timestamp` + `x-webhook-signature: sha256=HMAC(secret, "<ts>.<rawBody>")`.
Reply detection: forward inbound-reply events as `type: "replied"`, or mark leads as replied in the UI.

---

## Compliance & security

- **Default flow is Generate → Human review → Send.** Auto-send requires *both* the campaign
  toggle *and* turning off "Require approval" globally.
- Every send re-evaluates `services/compliance/rules.ts`: do-not-contact, unsubscribed, global and
  campaign suppression, prior bounce/complaint, reserved domains, target countries, follow-up max,
  hourly/daily/per-domain/per-campaign limits and minimum delay. Limit hits defer the job (never drop it);
  paused campaigns defer too.
- Bounces, complaints and unsubscribes are suppressed automatically and cancel all pending messages and
  follow-ups. Follow-ups stop on reply, unsubscribe, bounce, complaint or do-not-contact.
- Every email gets the sender's business name/address footer and a signed unsubscribe link, plus RFC 8058
  `List-Unsubscribe` one-click headers.
- **No fabrication:** the AI only sees verified facts; outreach can only reference "verified observations"
  derived from our own website check (it cannot say "you don't have a website" unless the check said so),
  and drafts are linted for fake personalisation and deceptive subjects (fallback: template). Templates
  never show AI-invented menus/services — unknown sections are clearly marked placeholders, and every
  preview carries a "concept, not an official website" banner.
- **AI output is data, never code:** Zod-validated JSON only; templates HTML-escape all values, hex-only
  colours, allow-listed fonts, `javascript:` links stripped, previews served with a strict CSP and no JS.
- Website checks are SSRF-hardened (private IPs blocked in production, manual redirect validation,
  timeouts, size caps). Images from businesses' sites are never copied; stock images keep license metadata.
- Auth: bcrypt, HttpOnly JWT cookie, role checks per route, Origin-check CSRF protection on mutations,
  Redis rate limiting (API + login), audit log for all state changes, secrets only in env vars.

**Legal note:** cold email rules differ by country (GDPR/ePrivacy/PECR in the EU/UK often require a
legitimate-interest assessment for B2B, CASL in Canada is opt-in, CAN-SPAM in the US). Configure
"Target countries" and your footer accordingly and take legal advice for your markets.

## Estimated external API costs (verify current pricing)

| Item | Per lead (approx.) |
|---|---|
| Claude analysis + website copy + email with `claude-opus-5` ($5/$25 per MTok) | ~$0.04–0.06 |
| Same with `claude-sonnet-5` ($2/$10 per MTok) via `AI_MODEL` | ~$0.015–0.025 |
| Template classification with `claude-haiku-4-5` (only for unknown categories, cached) | <$0.001 |
| Website checks, scoring, dedupe | $0 (no AI) |
| Google Places Text Search (20 results/request) | a few cents per request — see Google Maps Platform pricing |
| Email (Resend/SES/SendGrid) | fractions of a cent per email |

AI responses are cached by input hash, so regenerating identical input is free; only qualified leads reach AI.

## Remaining TODOs

- Inbound reply parsing (IMAP/Gmail or provider inbound webhooks) — today replies arrive via webhook `replied` events or manual status.
- Cloudflare Pages deployment provider; preview expiry/cleanup job.
- Provider-specific webhook adapters for SendGrid/SES event formats (Resend + generic are implemented).
- User management UI (users are created by the seed script / DB for now) and password reset.
- Per-lead image uploads (user-provided images) and more template layouts per category.
- Open/click tracking is intentionally not injected (privacy); add only where lawful.
