import { env } from "@/lib/env";
import type { DeploymentProvider } from "./DeploymentProvider";
import { VpsDeploymentProvider } from "./VpsDeploymentProvider";
import { VercelDeploymentProvider } from "./VercelDeploymentProvider";

export function getDeploymentProvider(): DeploymentProvider {
  const e = env();
  if (e.DEPLOYMENT_PROVIDER === "vercel") return new VercelDeploymentProvider(e.DEPLOYMENT_API_KEY ?? "", process.env.VERCEL_TEAM_ID);
  return new VpsDeploymentProvider(e.PREVIEW_OUTPUT_DIR);
}

export { previewUrlFor } from "./DeploymentProvider";
export type { DeploymentProvider };
