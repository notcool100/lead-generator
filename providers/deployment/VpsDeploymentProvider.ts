import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { previewUrlFor, type DeployInput, type DeployResult, type DeploymentProvider } from "./DeploymentProvider";

/**
 * Writes the static page to PREVIEW_OUTPUT_DIR/<slug>/index.html.
 * Served either by the app itself (/p/<slug>, subdomain rewrite in proxy.ts)
 * or directly by Nginx/Caddy from the shared volume (see docs in README).
 */
export class VpsDeploymentProvider implements DeploymentProvider {
  readonly name = "vps";
  constructor(private readonly outputDir: string) {}

  private dirFor(slug: string) {
    if (!/^[a-z0-9-]+$/.test(slug)) throw new Error(`Invalid preview slug: ${slug}`);
    return path.resolve(this.outputDir, slug);
  }

  async deploy({ slug, html, version }: DeployInput): Promise<DeployResult> {
    const dir = this.dirFor(slug);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "index.html"), html, "utf8");
    await writeFile(path.join(dir, `v${version}.html`), html, "utf8");
    return { url: previewUrlFor(slug), sourcePath: path.join(dir, "index.html") };
  }

  async remove(slug: string) {
    await rm(this.dirFor(slug), { recursive: true, force: true });
  }
}
