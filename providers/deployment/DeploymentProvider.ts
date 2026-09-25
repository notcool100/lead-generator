export interface DeployInput {
  slug: string;
  html: string;
  version: number;
}

export interface DeployResult {
  url: string;
  sourcePath: string | null;
  providerDeploymentId?: string;
}

export interface DeploymentProvider {
  readonly name: string;
  deploy(input: DeployInput): Promise<DeployResult>;
  remove?(slug: string): Promise<void>;
}

/** Public URL for a preview slug: subdomain when PREVIEW_BASE_DOMAIN is set, else path under APP_URL. */
export function previewUrlFor(slug: string): string {
  const base = process.env.PREVIEW_BASE_DOMAIN;
  if (base) return `https://${slug}.${base}`;
  return `${(process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "")}/p/${slug}`;
}
