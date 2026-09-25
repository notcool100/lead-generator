import { extractDomain, isNonOfficialHost, normalizeAddress, normalizeBusinessName, normalizeEmail } from "@/lib/normalize";
import type { NormalizedBusiness } from "@/types/lead";

export interface DedupeKeys {
  external: string | null;
  nameAddress: string | null;
  domain: string | null;
  email: string | null;
}

/** Keys in priority order: provider id → name+address → domain → email. */
export function dedupeKeys(b: Pick<NormalizedBusiness, "source" | "sourceExternalId" | "businessName" | "address" | "websiteUrl" | "email">): DedupeKeys {
  const name = normalizeBusinessName(b.businessName);
  const addr = normalizeAddress(b.address);
  const domain = extractDomain(b.websiteUrl);
  return {
    external: b.sourceExternalId ? `${b.source}:${b.sourceExternalId}` : null,
    nameAddress: name && addr ? `${name}|${addr}` : null,
    // IPs / localhost are shared hosts, not a business identity.
    domain: domain && !isNonOfficialHost(domain) && domain.includes(".") && !/^[\d.]+$|^\[?[0-9a-f:]+\]?$/i.test(domain) ? domain : null,
    email: normalizeEmail(b.email),
  };
}

/** In-memory de-duplication of a batch (first occurrence wins). */
export function dedupeBusinesses<T extends Parameters<typeof dedupeKeys>[0]>(items: T[]): { unique: T[]; duplicates: T[] } {
  const seen = new Set<string>();
  const unique: T[] = [];
  const duplicates: T[] = [];
  for (const item of items) {
    const k = dedupeKeys(item);
    const tagged = [k.external && `x:${k.external}`, k.nameAddress && `n:${k.nameAddress}`, k.domain && `d:${k.domain}`, k.email && `e:${k.email}`].filter(Boolean) as string[];
    if (tagged.some((t) => seen.has(t))) {
      duplicates.push(item);
      continue;
    }
    tagged.forEach((t) => seen.add(t));
    unique.push(item);
  }
  return { unique, duplicates };
}
