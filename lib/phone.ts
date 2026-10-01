/**
 * Minimal E.164 normalisation for outbound calls (Retell requires E.164).
 * Numbers already in international form are kept; national numbers need a
 * known country calling code. Unknown → null (the call is refused, never guessed).
 */
const CALLING_CODES: Record<string, string> = {
  "united states": "1", usa: "1", us: "1", canada: "1",
  "united kingdom": "44", uk: "44", england: "44", scotland: "44", wales: "44",
  ireland: "353", australia: "61", "new zealand": "64", "south africa": "27",
  india: "91", nepal: "977", pakistan: "92", bangladesh: "880", "sri lanka": "94",
  "united arab emirates": "971", uae: "971", singapore: "65", malaysia: "60", philippines: "63",
  germany: "49", france: "33", spain: "34", portugal: "351", italy: "39", netherlands: "31", belgium: "32",
  switzerland: "41", austria: "43", sweden: "46", norway: "47", denmark: "45", finland: "358", poland: "48",
  mexico: "52", brazil: "55", nigeria: "234", kenya: "254",
};

/** Countries whose national format starts with a trunk "0" that is dropped internationally. */
const TRUNK_ZERO = new Set(["44", "353", "61", "64", "27", "91", "92", "880", "94", "971", "60", "63", "49", "33", "31", "32", "41", "43", "46", "47", "358", "48", "234", "254", "977"]);

export function callingCodeFor(country: string | null | undefined): string | null {
  if (!country) return null;
  return CALLING_CODES[country.trim().toLowerCase()] ?? null;
}

export function toE164(raw: string | null | undefined, country: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  let digits = trimmed.replace(/[^\d]/g, "");
  if (!digits) return null;
  if (trimmed.startsWith("+")) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (trimmed.startsWith("00")) {
    digits = digits.slice(2);
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }
  const code = callingCodeFor(country);
  if (!code) return null;
  if (digits.startsWith(code) && digits.length > code.length + 6) return `+${digits}`;
  if (code === "1" && digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (TRUNK_ZERO.has(code) && digits.startsWith("0")) digits = digits.replace(/^0+/, "");
  const full = `${code}${digits}`;
  return full.length >= 8 && full.length <= 15 ? `+${full}` : null;
}
