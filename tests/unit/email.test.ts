import { describe, expect, it } from "vitest";
import { deterministicEmail, lintOutreachEmail, renderTemplateString, type OutreachFacts } from "@/prompts/outreach";
import { buildVerifiedObservations } from "@/services/outreach/observations";
import { buildFooter, renderEmailBodies } from "@/services/email/EmailSender";
import { ComplianceSettingsSchema } from "@/services/compliance/settings";
import { isReservedDomain } from "@/providers/email/EmailProvider";

const facts: OutreachFacts = {
  businessName: "Luna", recipientName: null, category: "restaurant", city: "Lisbon", verifiedObservations: [],
  senderName: "Alex", senderCompany: null, sequenceNumber: 0, previousSubject: null,
  templateSubject: "A quick website preview for {{business_name}}", templateIntro: "I came across {{business_name}} in {{city}}.",
  offer: { price: "$110/month", includes: ["Website", "Hosting and SSL", "Maintenance"] }, relevantFeatures: [],
};

describe("email generation", () => {
  it("renders the configurable template and keeps the preview token", () => {
    const e = deterministicEmail(facts);
    expect(e.subject).toBe("A quick website preview for Luna");
    expect(e.body).toContain("I came across Luna in Lisbon.");
    expect(e.body).toContain("{{preview_url}}");
    expect(lintOutreachEmail(e, { price: "$110/month", sequenceNumber: 0 })).toEqual([]);
  });
  it("pitches the recurring monthly offer with a low-pressure CTA", () => {
    const e = deterministicEmail(facts);
    expect(e.body).toContain("$110/month");
    expect(e.body).toMatch(/monthly service/);
    expect(e.body).toContain("Would you be open to taking a quick look at the preview?");
  });
  it("lint rejects missing price, discounts and exaggerated promises", () => {
    const body = "Hi {{preview_url}} " + "x".repeat(40);
    expect(lintOutreachEmail({ subject: "Hi", body }, { price: "$110/month", sequenceNumber: 0 })).toContain("does not state the monthly price ($110/month)");
    expect(lintOutreachEmail({ subject: "Hi", body }, { price: "$110/month", sequenceNumber: 1 })).toEqual([]);
    expect(lintOutreachEmail({ subject: "Hi", body: `${body} We will double your leads.` }).length).toBe(1);
    expect(lintOutreachEmail({ subject: "Hi", body: `${body} Guaranteed customers!` }).length).toBe(1);
    expect(lintOutreachEmail({ subject: "Hi", body: `${body} 20% off this week` }).length).toBe(1);
    expect(lintOutreachEmail({ subject: "Hi", body: `${body} You are losing customers every day.` }).length).toBe(1);
  });
  it("makes no website claims without verified observations", () => {
    expect(deterministicEmail(facts).body).not.toMatch(/noticed/);
  });
  it("uses a verified observation when available", () => {
    const e = deterministicEmail({ ...facts, verifiedObservations: ["I couldn't find a website for Luna"] });
    expect(e.body).toContain("I noticed I couldn't find a website for Luna.");
  });
  it("lint rejects fake personalisation, deception and raw links", () => {
    expect(lintOutreachEmail({ subject: "Re: your order", body: "I loved your food {{preview_url}} " + "x".repeat(40) }).length).toBeGreaterThanOrEqual(2);
    expect(lintOutreachEmail({ subject: "Hi", body: "Visit https://evil.example " + "x".repeat(40) })).toContain("missing {{preview_url}} token");
  });
  it("removes unknown placeholders", () => {
    expect(renderTemplateString("Hi {{nope}}{{business_name}}", { business_name: "Luna" })).toBe("Hi Luna");
  });
  it("only claims no website when the check said so", () => {
    const base = { businessName: "Luna", websiteUrl: "https://luna.com", reasons: [], rating: null, reviewCount: null, mobileFriendly: null, hasBooking: null, hasMenu: null, category: "restaurant" };
    expect(buildVerifiedObservations({ ...base, websiteStatus: "no_website", checkPerformed: false })).toEqual([]);
    expect(buildVerifiedObservations({ ...base, websiteStatus: "good_website", checkPerformed: true }).join(" ")).not.toMatch(/couldn't find/);
    expect(buildVerifiedObservations({ ...base, websiteStatus: "no_website", checkPerformed: true })[0]).toMatch(/couldn't find a website/);
  });
  it("appends a compliant footer with address and unsubscribe link", () => {
    const s = ComplianceSettingsSchema.parse({ businessName: "Studio", businessAddress: "1 Road, Lisbon" });
    const footer = buildFooter(s, "https://app/unsubscribe/t");
    const { text, html } = renderEmailBodies("Hello\n\nhttps://app/p/luna", footer);
    expect(text).toContain("1 Road, Lisbon");
    expect(text).toContain("Unsubscribe: https://app/unsubscribe/t");
    expect(html).toContain('<a href="https://app/p/luna">');
    expect(renderEmailBodies("<b>x</b>", footer).html).not.toContain("<b>x</b>");
  });
  it("detects reserved (never-deliverable) domains", () => {
    expect(isReservedDomain("a@luna.example")).toBe(true);
    expect(isReservedDomain("a@example.com")).toBe(true);
    expect(isReservedDomain("a@luna.pt")).toBe(false);
  });
});
