import { prisma } from "@/lib/db";
import { renderPreviewHtml } from "@/templates/render";
import { PreviewConfigSchema } from "@/types/preview";

/** Public preview page. Rendered from the stored, validated config (no AI output is executed). */
export async function GET(_req: Request, ctx: RouteContext<"/p/[slug]">) {
  const { slug } = await ctx.params;
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return new Response("Not found", { status: 404 });
  const preview = await prisma.websitePreview.findUnique({ where: { subdomain: slug } });
  if (!preview || preview.deploymentStatus !== "deployed") return new Response("Preview not found", { status: 404 });
  const config = PreviewConfigSchema.safeParse(preview.generatedContent);
  if (!config.success) return new Response("Preview unavailable", { status: 500 });
  return new Response(renderPreviewHtml(config.data), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Robots-Tag": "noindex, nofollow",
      "Content-Security-Policy": "default-src 'none'; img-src https: data:; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; frame-ancestors 'self'; base-uri 'none'; form-action 'none'",
      "Cache-Control": "public, max-age=60",
    },
  });
}
