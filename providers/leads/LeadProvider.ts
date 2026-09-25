import type { BusinessSearchQuery, BusinessSearchResult, NormalizedBusiness } from "@/types/lead";

export interface LeadProvider {
  readonly name: string;
  searchBusinesses(query: BusinessSearchQuery): Promise<BusinessSearchResult>;
  getBusiness(externalId: string): Promise<NormalizedBusiness | null>;
}

export class LeadProviderError extends Error {
  constructor(message: string, public readonly transient = true) {
    super(message);
  }
}
