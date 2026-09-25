import type { DeployInput, DeployResult, DeploymentProvider } from "./DeploymentProvider";

/** Deploys the single static file via the Vercel REST API (v13 deployments, inline files). */
export class VercelDeploymentProvider implements DeploymentProvider {
  readonly name = "vercel";
  constructor(private readonly token: string, private readonly teamId?: string) {
    if (!token) throw new Error("DEPLOYMENT_API_KEY (Vercel token) is required for DEPLOYMENT_PROVIDER=vercel");
  }

  async deploy({ slug, html }: DeployInput): Promise<DeployResult> {
    const qs = this.teamId ? `?teamId=${encodeURIComponent(this.teamId)}` : "";
    const res = await fetch(`https://api.vercel.com/v13/deployments${qs}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `preview-${slug}`.slice(0, 100),
        target: "production",
        files: [{ file: "index.html", data: html }],
        projectSettings: { framework: null },
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`Vercel ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = (await res.json()) as { id: string; url: string; alias?: string[] };
    return { url: `https://${data.alias?.[0] ?? data.url}`, sourcePath: null, providerDeploymentId: data.id };
  }
}
