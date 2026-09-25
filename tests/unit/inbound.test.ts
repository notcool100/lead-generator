import { describe, expect, it } from "vitest";
import { classifyInbound, extractIds, replyText, type InboundMail } from "@/services/email/inboundClassifier";

const D = "ubucknepal.com";
const base = (over: Partial<InboundMail>): InboundMail => ({
  from: "owner@cafe.com.np", subject: "Re: A quick website preview", text: "", headers: {}, inReplyTo: null, references: [], raw: "", contentType: "text/plain", ...over,
});

describe("inbound email classification", () => {
  it("detects a human reply linked by In-Reply-To", () => {
    const c = classifyInbound(base({ text: "Looks great, call me tomorrow!\n\nOn Mon, Alex wrote:\n> Hi", inReplyTo: "<abc-1@ubucknepal.com>" }), D);
    expect(c).toMatchObject({ kind: "reply", refs: ["abc-1@ubucknepal.com"], snippet: "Looks great, call me tomorrow!" });
  });
  it("uses References when In-Reply-To is missing", () => {
    expect(classifyInbound(base({ text: "yes", references: ["<x@other.com>", "<abc-2@ubucknepal.com>"] }), D).refs).toContain("abc-2@ubucknepal.com");
  });
  it("treats unsubscribe wording in the reply (not the quote) as unsubscribe", () => {
    expect(classifyInbound(base({ text: "Please remove me from your list", inReplyTo: "<a@ubucknepal.com>" }), D).kind).toBe("unsubscribe");
    expect(classifyInbound(base({ text: "No thanks.", inReplyTo: "<a@ubucknepal.com>" }), D).kind).toBe("unsubscribe");
    expect(classifyInbound(base({ text: "Sounds good\n> to unsubscribe click here", inReplyTo: "<a@ubucknepal.com>" }), D).kind).toBe("reply");
  });
  it("ignores out-of-office auto replies", () => {
    expect(classifyInbound(base({ subject: "Automatic reply: A quick website preview", headers: { "Auto-Submitted": "auto-replied" }, inReplyTo: "<a@ubucknepal.com>" }), D).kind).toBe("auto_reply");
  });
  it("detects hard bounces and finds our original Message-ID in the report", () => {
    const raw = `Message-ID: <dsn-1@mail.adyatech.com.np>\nContent-Type: multipart/report; report-type=delivery-status\n\nAction: failed\nStatus: 5.1.1\n\nMessage-ID: <orig-9@ubucknepal.com>\n`;
    const c = classifyInbound(base({ from: "MAILER-DAEMON@mail.adyatech.com.np", subject: "Undelivered Mail Returned to Sender", raw, contentType: "multipart/report; report-type=delivery-status", headers: { "message-id": "<dsn-1@mail.adyatech.com.np>" } }), D);
    expect(c).toMatchObject({ kind: "bounce_hard", refs: ["orig-9@ubucknepal.com"] });
  });
  it("treats delayed (4.x.x) delivery notices as soft", () => {
    const raw = "Content-Type: multipart/report; report-type=delivery-status\nAction: delayed\nStatus: 4.4.1\nMessage-ID: <o@ubucknepal.com>";
    expect(classifyInbound(base({ from: "MAILER-DAEMON@x", subject: "Delayed Mail", raw, contentType: "multipart/report; report-type=delivery-status" }), D).kind).toBe("bounce_soft");
  });
  it("ignores unrelated mail", () => expect(classifyInbound(base({ subject: "Hello", text: "random" }), D).kind).toBe("other"));
  it("helpers", () => {
    expect(extractIds("<A@B.com> <c@d.org>")).toEqual(["a@b.com", "c@d.org"]);
    expect(replyText("Yes please\n-- \nsig")).toBe("Yes please");
  });
});
