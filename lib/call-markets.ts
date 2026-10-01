/**
 * Per-country rules for AI calls. Pure and client-safe (used by the wizard too).
 * Legal windows are hard limits applied on top of the operator's calling hours.
 * Summaries of the rules, not legal advice — confirm with the regulator.
 */
export type CallMarketKey = "us" | "au" | "uk" | "nz";

export interface CallMarket {
  key: CallMarketKey;
  label: string;
  /** Retell speech-recognition language. */
  language: "en-US" | "en-AU" | "en-GB" | "en-NZ";
  voices: { id: string; label: string }[];
  timezones: string[];
  /** Plain-language summary of the legal calling window. */
  legalHours: string;
  /** Do Not Call register that must be checked before calling (null = none required for business numbers). */
  dncRegister: { name: string; url: string } | null;
  notes: string;
}

export const CALL_MARKETS: Record<CallMarketKey, CallMarket> = {
  us: {
    key: "us",
    label: "United States",
    language: "en-US",
    voices: [
      { id: "11labs-Billy", label: "Billy — American male" },
      { id: "11labs-Grace", label: "Grace — American female" },
    ],
    timezones: ["America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu"],
    legalHours: "8am–9pm local time (TCPA)",
    dncRegister: null,
    notes: "AI-voice sales calls to mobile numbers need prior express written consent (TCPA). Prefer calling people who asked to be called.",
  },
  au: {
    key: "au",
    label: "Australia",
    language: "en-AU",
    voices: [
      { id: "11labs-charlie", label: "Charlie — Australian male" },
      { id: "11labs-Noah", label: "Noah — Australian male" },
    ],
    timezones: ["Australia/Sydney", "Australia/Melbourne", "Australia/Brisbane", "Australia/Adelaide", "Australia/Darwin", "Australia/Perth", "Australia/Hobart"],
    legalHours: "Weekdays 9am–8pm, Saturday 9am–5pm, never Sundays or national public holidays",
    dncRegister: { name: "Do Not Call Register (ACMA)", url: "https://www.donotcall.gov.au/industry/" },
    notes: "Telemarketing Industry Standard: identify yourself and your company at the start, end the call when asked, caller ID must not be hidden.",
  },
  uk: {
    key: "uk",
    label: "United Kingdom",
    language: "en-GB",
    voices: [
      { id: "11labs-Anthony", label: "Anthony — British male" },
      { id: "11labs-Amy", label: "Amy — British female" },
    ],
    timezones: ["Europe/London"],
    legalHours: "8am–9pm (Ofcom guidance)",
    dncRegister: { name: "TPS / Corporate TPS", url: "https://www.tpsonline.org.uk/" },
    notes: "PECR: automated (recorded/AI) marketing calls need prior consent. Check with a UK adviser before AI cold calling.",
  },
  nz: {
    key: "nz",
    label: "New Zealand",
    language: "en-NZ",
    voices: [
      { id: "11labs-charlie", label: "Charlie — Australian male" },
      { id: "11labs-Amy", label: "Amy — British female" },
    ],
    timezones: ["Pacific/Auckland"],
    legalHours: "8am–9pm",
    dncRegister: null,
    notes: "Follow the Marketing Association's do-not-call list as good practice.",
  },
};

export const CALL_MARKET_KEYS = Object.keys(CALL_MARKETS) as CallMarketKey[];

/** Best-guess market from a country name (used for leads without a campaign and as the wizard default). */
export function marketForCountry(country: string | null | undefined): CallMarketKey {
  const c = (country ?? "").trim().toLowerCase();
  if (["australia", "au"].includes(c)) return "au";
  if (["united kingdom", "uk", "england", "scotland", "wales", "northern ireland", "great britain"].includes(c)) return "uk";
  if (["new zealand", "nz"].includes(c)) return "nz";
  return "us";
}

/** Gregorian Easter Sunday (Anonymous / Meeus algorithm), as a UTC date. */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

/** Australian national public holidays (the ones the Telemarketing Standard refers to). Dates as "MM-DD". */
export function australianNationalHolidays(year: number): Set<string> {
  const fmt = (d: Date) => `${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  const easter = easterSunday(year);
  const plus = (days: number) => new Date(easter.getTime() + days * 86_400_000);
  return new Set(["01-01", "01-26", fmt(plus(-2)), fmt(plus(1)), "04-25", "12-25", "12-26"]);
}

/** Is a local wall-clock time inside the market's legal calling window? */
export function legalCallWindow(market: CallMarketKey, local: { year: number; month: number; day: number; weekday: number; hour: number }): boolean {
  switch (market) {
    case "au": {
      if (local.weekday === 0) return false;
      const md = `${String(local.month).padStart(2, "0")}-${String(local.day).padStart(2, "0")}`;
      if (australianNationalHolidays(local.year).has(md)) return false;
      if (local.weekday === 6) return local.hour >= 9 && local.hour < 17;
      return local.hour >= 9 && local.hour < 20;
    }
    default:
      return local.hour >= 8 && local.hour < 21;
  }
}
