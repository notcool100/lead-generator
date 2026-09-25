import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/db";
import { FONT_PAIRS, TEMPLATES } from "@/templates/registry";

export default async function TemplatesPage() {
  const usage = await prisma.websitePreview.groupBy({ by: ["templateId"], _count: { _all: true } });
  const rows = await prisma.websiteTemplate.findMany();
  const used = (key: string) => {
    const t = rows.find((r) => r.key === key);
    return t ? (usage.find((u) => u.templateId === t.id)?._count._all ?? 0) : 0;
  };
  return (
    <>
      <PageHeader title="Templates" description="Reusable, code-reviewed templates. The AI fills structured JSON; it never writes HTML." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Object.values(TEMPLATES).map((t) => (
          <Card key={t.key} className="overflow-hidden">
            <div className="flex h-24" aria-hidden>
              {t.palettes[0] && Object.values(t.palettes[0]).map((c, i) => <div key={i} className="flex-1" style={{ background: c }} />)}
            </div>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{t.name}</CardTitle>
                <Badge tone="neutral">{t.key.replace(/_/g, " ")}</Badge>
              </div>
              <CardDescription>{t.description}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-1 text-xs text-muted-foreground">
              <p>Layout: {t.layout} · Fonts: {FONT_PAIRS[t.defaultFontPair].heading} / {FONT_PAIRS[t.defaultFontPair].body}</p>
              <p>Sections: hero, navigation, about, {t.offeringsTitle.toLowerCase()}, gallery, location, contact, CTA, footer</p>
              <p>Palettes: {t.palettes.length} · Used by {used(t.key)} preview{used(t.key) === 1 ? "" : "s"}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
