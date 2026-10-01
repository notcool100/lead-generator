import "dotenv/config";

process.env.NEXTAUTH_SECRET ??= "test-secret-test-secret-test-secret";
// Integration tests use a separate database when TEST_DATABASE_URL is set.
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.LOG_LEVEL ??= "warn";
// Tests never call real AI or lead sources.
process.env.AI_PROVIDER = "mock";
process.env.LEAD_PROVIDER = "mock";
// …nor paid enrichment (Apify) or real phone calls, even when .env has keys.
process.env.APIFY_FACEBOOK_ENRICHMENT = "false";
delete process.env.RETELL_API_KEY;
delete process.env.RETELL_AGENT_ID;
delete process.env.RETELL_FROM_NUMBER;
