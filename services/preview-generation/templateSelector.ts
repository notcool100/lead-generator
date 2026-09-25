import { matchTemplateByKeyword, type TemplateKey } from "@/templates/registry";
import { TEMPLATE_CLASSIFY_SYSTEM, TemplateClassificationSchema } from "@/prompts/website-content";
import { generateJsonCached } from "@/services/ai-analysis/aiClient";

/** Keyword match first (free); small model only when the category is ambiguous. */
export async function selectTemplate(category: string): Promise<{ key: TemplateKey; method: "keyword" | "ai" }> {
  const byKeyword = matchTemplateByKeyword(category);
  if (byKeyword) return { key: byKeyword, method: "keyword" };
  const res = await generateJsonCached({
    system: TEMPLATE_CLASSIFY_SYSTEM,
    prompt: `Business category: ${JSON.stringify(category)}`,
    schema: TemplateClassificationSchema,
    schemaName: "template_classification",
    tier: "small",
    maxTokens: 200,
  });
  return { key: res.data.templateKey, method: "ai" };
}
