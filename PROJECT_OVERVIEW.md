# AI Lead Generator — Project Overview

_Last updated: 25 September 2026 (evening)_

## 1. What this project is

**AI Lead Generator** finds local businesses (restaurants, cafés, hotels, salons, gyms, dentists and similar) that have **no website or a weak one**. For each one it builds a **personalised website preview**, then helps you contact the business with an honest email that links to the preview.

It is a **compliant outbound sales tool**, not a mass mailer. Every email is reviewed by a person before it's sent. Sending limits, opt-outs and suppression lists are enforced automatically, and the AI may only state facts the system has verified.

**The pitch it enables:** _"I noticed you don't have a website. Here's a free concept I made for you: `ai-lead.ubucknepal.com/p/your-business`. Want me to build the real one?"_

---

## 2. How it works (the pipeline)

```
 Campaign (category + city + country + sources)
        │
        ▼
 1. Lead discovery ────── OpenStreetMap · Claude web search · Google Maps* · Yelp*
        │                 (20 leads per run, merged & de-duplicated)
        ▼
 2. Website check ─────── HTTP/HTTPS, redirects, mobile viewport, contact info, CTA,
        │                 booking, outdated tech → score 0–100 + reasons   (no AI)
        ▼
 3. Lead scoring & qualification (website opportunity + contactability + reputation)
        │
        ▼
 4. AI business analysis ─ Claude: summary, opportunity, recommended features
        │                   (only from verified facts)
        ▼
 5. Website preview ────── template chosen (9 templates) → Claude writes copy as JSON
        │                   → rendered to static HTML → deployed at /p/<business-slug>
        ▼
 6. Outreach draft ─────── Claude writes a short email using only "verified observations"
        │
        ▼
 7. HUMAN REVIEW ───────── Approve & send · Edit · Regenerate · Reject · Suppress
        │
        ▼
 8. Sending ────────────── SMTP (mailcow, outreach@ubucknepal.com) within daily/hourly/
        │                   per-domain/per-campaign limits, with an unsubscribe footer + header
        ▼
 9. Inbox sync (IMAP, every 2 min) → reply / unsubscribe / bounce detection
        │
        ▼
10. Follow-ups (day 4, day 8), stopped automatically on reply/unsubscribe/bounce
        │
        ▼
11. Pipeline: replied → interested → converted
```

\* Google Maps and Yelp are implemented but need API keys.

Every step runs as a **background job** (BullMQ + Redis) in a separate **worker** process. Jobs retry automatically, and their history is visible on the System Jobs page.

---

## 3. Tech stack

| Area | Technology |
|---|---|
| Web app | Next.js 16 (App Router), React 19, TypeScript (strict), Tailwind CSS v4, shadcn-style components, Recharts |
| API | Next.js route handlers (REST) + Zod validation |
| Database | PostgreSQL + Prisma 7 (migrations, UUID keys, indexes) |
| Background jobs | Redis + BullMQ (9 queues, separate worker process) |
| AI | Claude via **your Claude subscription** (Claude Code CLI, `claude_code` provider). An Anthropic API key, OpenAI or an offline mock can be used instead |
| Lead data | OpenStreetMap (Nominatim + Overpass), Claude web search, Google Places API, Yelp Fusion |
| Email | SMTP to your own mailcow server; Resend, SendGrid and Amazon SES are also supported |
| Inbox | IMAP (imapflow + mailparser) |
| Hosting | Docker, deployed with **Coolify** on the Contabo VPS |
| Tests | Vitest: 83 tests (unit tests + a full-workflow integration test against PostgreSQL) |

---

## 4. What has been implemented so far

### 4.1 Core platform
- [x] Email/password login (bcrypt, signed session cookie, roles: admin / operator / viewer)
- [x] Dashboard with KPI cards and charts (funnel, website status, leads by category and country)
- [x] Campaign wizard with 11 steps (name, country, city, category, **data sources**, lead limit, website criteria, previews, outreach, daily limit, launch)
- [x] Campaign pages: stats, pause/resume, **"Discover next 20"** button
- [x] Lead explorer with search and filters, plus a detailed lead page showing:
  business info, website analysis, AI analysis, live preview, email editor, message history, and a full timeline
- [x] Previews, Outreach (review queue), Follow-ups, Templates, Analytics, Suppression List, Settings and System Jobs pages
- [x] Audit log of every important action

### 4.2 Lead discovery
- [x] Pluggable `LeadProvider` interface
- [x] **OpenStreetMap**: free and live, with automatic fallback across several Overpass servers
- [x] **Claude web search**: searches Maps listings, TripAdvisor, directories and social pages. Every result must come with a source URL, which is fetched to verify the business exists
- [x] **Google Places** and **Yelp** providers (need keys)
- [x] Several sources can be combined per campaign; a failing source is skipped without stopping the run
- [x] De-duplication by provider ID, name + address, domain and email. A duplicate from another source **enriches** the existing lead
- [x] **Batches of 20 per run**, resuming from a saved cursor

### 4.3 Website analysis (deterministic, no AI cost)
- [x] SSRF-safe fetching (private IPs blocked, redirects checked, timeouts and size limits)
- [x] Checks HTTPS/SSL, response time, mobile viewport, contact details, CTA, booking, menu, social links, structured data, parked/placeholder domains and outdated signals (old copyright, table layouts, Flash, jQuery 1.x)
- [x] Score from 0 to 100 (technical, content and design sub-scores) with human-readable reasons
- [x] Domain discovery for leads with no listed website
- [x] Never reports "no website" when a website URL is listed

### 4.4 AI (Claude)
- [x] `AIProvider` abstraction: `claude_code` (subscription), `anthropic` (API), `openai`, `mock`
- [x] Business analysis, website copy, outreach emails, and template classification (small model)
- [x] Strict JSON output validated with Zod; AI output is never executed as code
- [x] Anti-fabrication rules: no invented prices, services, awards or history
- [x] AI response cache: identical input is never paid for twice

### 4.5 Website previews
- [x] 9 templates: restaurant, café, hotel, salon, gym, dentist, event venue, real estate, professional services
- [x] The AI fills a typed JSON config; templates render static HTML with every value escaped
- [x] **Redesigned, photo-led pages with 10 sections:** sticky header with monogram, hero (full-screen photo or split photo collage), highlights ribbon, "About" collage, menu/services bento, parallax statement band, gallery mosaic, reviews block (real rating and stars only), "Find us" contact section, closing call to action, and a full footer
- [x] Each category has its own colour palette and font pair (the gym is dark by design), plus automatic dark mode for every template
- [x] **CSS-only motion:** hero fade-in and slow zoom, parallax, scroll reveals, highlights marquee and hover effects. Everything switches off for visitors who prefer reduced motion
- [x] Unknown menus, services, opening hours and reviews are shown as clearly labelled samples, never invented
- [x] "Website concept, not an official website" banner, a strict Content Security Policy, and no JavaScript
- [x] Licensed stock photos per page section from **Unsplash** or **Pexels** (needs a free key), varied per business, cached, and credited in the footer. Without a key, on-brand gradient placeholders are shown
- [x] Icons from the Phosphor icon library, and a responsive layout tested at desktop and phone width
- [x] Served at `https://ai-lead.ubucknepal.com/p/<slug>`; subdomain previews are supported

### 4.6 Outreach and compliance
- [x] Default flow: **Generate → human review → send**. Auto-send needs two explicit switches
- [x] Emails may only reference **verified observations** from the website check
- [x] Honesty check that rejects fake personalisation ("I loved your food…"), deceptive subjects and raw links
- [x] Configurable email template (subject and opening line)
- [x] Footer with business name, address and unsubscribe link, plus one-click `List-Unsubscribe` headers
- [x] Limits: per day, per hour, per recipient domain per day, per campaign per day, minimum delay between sends. Limit hits defer the email; they never drop it
- [x] Global and per-campaign suppression lists, do-not-contact flag, target-country restriction
- [x] Signed unsubscribe links and an unsubscribe page

### 4.7 Email sending and receiving
- [x] Mailbox **outreach@ubucknepal.com** created on mailcow (DKIM-signed as `ubucknepal.com`)
- [x] SMTP sending with our own Message-ID; a copy is saved to the Sent folder
- [x] **IMAP inbox sync every 2 minutes**:
  - human reply → lead marked **Replied**, follow-ups stopped, reply text on the timeline
  - "unsubscribe", "remove me", "no thanks", "not interested" → permanently suppressed
  - bounce reports → address suppressed
  - out-of-office auto-replies → ignored
- [x] Webhook endpoint for Resend and generic HMAC-signed events
- [x] "Send test email" button in Settings
- [x] **Deliverability set up on the mail server:**
  - Reverse DNS for the VPS (IPv4 `217.216.58.116` and IPv6 `2400:d321:2337:9476::1`) points to `mail.ubucknepal.com`
  - Cloudflare `AAAA` record for `mail.ubucknepal.com`
  - mailcow's outgoing mail name set to `mail.ubucknepal.com` (`smtp_helo_name` in `data/conf/postfix/extra.cf`; this applies to every domain on that server)
  - Port25 independent check: **SPF, reverse DNS and DKIM all pass**. DMARC record in place

### 4.8 Deployment
- [x] Dockerfile (includes the Claude Code CLI) and `docker-compose.coolify.yml` (web + worker + Redis)
- [x] Deployed in Coolify (project **AI-Lead-Generator**, environment _production_) from the private GitHub repo `notcool100/lead-generator` via the **anjal-github** app
- [x] Uses the existing Coolify PostgreSQL. Migrations and the admin seed run automatically on start
- [x] Health checks for the web app (`/api/health`, which checks the database and Redis) and the worker (port 3001)
- [x] Domain `ai-lead.ubucknepal.com` live, with HTTPS via Let's Encrypt (Traefik)
- [x] Claude runs in production on the Claude subscription (`CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token`), verified from inside the worker

---

## 5. Current status and open items

| Item | Status | Action |
|---|---|---|
| App containers (web, worker, Redis) | ✅ healthy | — |
| Database migrations and admin user | ✅ done | — |
| Domain `ai-lead.ubucknepal.com` + HTTPS | ✅ live | — |
| Claude in production (subscription token) | ✅ working | — |
| Mail (SMTP + IMAP) | ✅ working | — |
| Reverse DNS + mail server name (`mail.ubucknepal.com`) | ✅ done, SPF/reverse DNS/DKIM pass | — |
| Preview redesign | ⚠️ committed locally, not pushed or deployed | Push to GitHub and redeploy in Coolify |
| Preview photos | ⚠️ no key yet (placeholders shown) | Add `UNSPLASH_ACCESS_KEY` or `PEXELS_API_KEY` (free), then **Regenerate** existing previews |
| Business postal address in the email footer | ⚠️ empty | Settings → Outreach compliance |
| Security clean-up | ⚠️ | Change the VPS root password (it was shared in chat), restrict the mailcow API key (it currently skips IP checks), revoke the Coolify deploy token |
| README | ⚠️ partly out of date | Update the setup sections for Claude subscription, SMTP/IMAP and Coolify |
| Google Maps source | ⏸ optional | Add `GOOGLE_PLACES_API_KEY` |

---

## 6. Features we can add next

### High priority (most business value)
1. **Reply management inside the app.** Show the full reply thread on the lead page and reply from the dashboard over SMTP, so you don't have to switch to webmail.
2. **"Interested" pipeline board.** A Kanban view (Replied → Interested → Proposal sent → Won/Lost) with notes, deal value and next-action reminders.
3. **Convert preview → real website.** A one-click "promote" that copies the concept into an editable production site on its own domain, with image uploads and real menu/services entry.
4. **Preview analytics.** Track when a business opens its preview link (privacy-friendly counter), and use it to prioritise follow-ups ("viewed the preview 3 times").
5. **Google Maps API key setup** for richer data (ratings, reviews, opening hours, photos count). This improves scoring and email personalisation.
6. **WhatsApp / phone outreach option.** Many Nepali businesses list only a phone number. Add a "call / WhatsApp script" for leads without email, and log the call outcome.

### Medium priority
7. **User management page.** Invite team members, set roles, reset passwords (currently only the seeded admin exists).
8. **Scheduled campaigns.** Automatically discover the next 20 leads on a schedule (daily/weekly) until the campaign limit is reached.
9. **More templates and variants per category**, plus a template editor and brand colour picker.
10. **Business photo uploads.** Let the owner upload their own photos to replace the stock ones (stock photos per section are already done).
11. **A/B testing of subject lines and openers**, with reply-rate statistics per variant.
12. **Lead import/export** (CSV) and a CRM push (HubSpot, Pipedrive, Google Sheets).
13. **Deliverability dashboard.** Bounce and complaint rates per day, a warm-up schedule that raises limits automatically, and blocklist checks.
14. **Multi-mailbox rotation.** Send from 2–3 mailboxes (e.g. `hello@`, `anjal@`) with per-mailbox limits.

### Nice to have
15. **Multi-language previews and emails** (Nepali and English), picked per campaign.
16. **Cloudflare Pages / Vercel deployment** for previews (the provider interface already exists).
17. **Preview expiry and cleanup** (e.g. archive previews after 60 days with no response).
18. **Notifications** (email, Slack or Telegram) when a lead replies or shows interest.
19. **Cost and usage panel** showing Claude calls per campaign and how close you are to subscription limits.
20. **Public "get your free website concept" landing page** where businesses can request a preview themselves (inbound leads).

### Technical improvements
- Error monitoring (Sentry) and uptime alerts
- Automatic database backups for the lead database (Coolify scheduled backups)
- Anthropic API key fallback for when subscription limits are reached
- More end-to-end browser tests (Playwright) for the approval flow
- Rate-limit dashboard and a queue pause switch in System Jobs

---

## 7. Useful references

| | |
|---|---|
| Production app | https://ai-lead.ubucknepal.com (after DNS is added) |
| Coolify project | https://coolify.dailysewa.com, project **AI-Lead-Generator** |
| Repository | https://github.com/notcool100/lead-generator (private) |
| Outreach mailbox | `outreach@ubucknepal.com` (webmail on the mailcow server) |
| Setup and commands | `README.md` |
| Environment variables | `.env.example` (secrets live only in `.env` and in Coolify) |
| Original specification | `AI-Lead-Generation-and-Website-Preview-System.md` |
