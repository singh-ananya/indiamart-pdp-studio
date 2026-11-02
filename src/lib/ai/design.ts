import {
  BENCHMARK_PATTERNS,
  countPatterns,
  inspectedEntries,
  type BenchmarkFile,
} from "@/lib/pdp/benchmark";
import { countWithData, filledProducts } from "@/lib/pdp/block-data";
import {
  ALL_BLOCKS,
  arrange,
  BLOCK_LABELS,
  generateConcepts,
  type ConceptInputs,
} from "@/lib/pdp/concepts";
import { IM_DESIGN_RULES, IM_STICKY_BAR_HEIGHT } from "@/lib/pdp/indiamart-design";
import { levelText } from "@/lib/pdp/mcat-config";
import { parseSpecLines } from "@/lib/pdp/specs";
import type { BlockKind, Concept } from "@/lib/pdp/types";
import { checkBaseUrl, type AiProvider, type ProviderSettings } from "./providers";

/**
 * AI-designed concepts. The model decides only design matters — block order, what
 * goes above the fold, which of the products' real ISQ values to feature, button
 * labels and the reasoning — from the MCAT ranking, the benchmark research and what
 * product data exists. Every decision is checked here before use, and product data
 * shown in the previews always comes from the products themselves.
 */

export const AI_CONCEPT_COUNT = 5;
const MAX_FIRST_FOLD = 6;
const MAX_KEY_ISQ = 4;

/** IndiaMART-style enquiry labels the AI may choose from. */
export const CTA_LABELS = [
  "Get Best Price",
  "Get Latest Price",
  "Contact Supplier",
  "Call Supplier",
  "Send Inquiry",
  "Send Enquiry",
  "Call Now",
  "Request Callback",
  "Ask for Quotation",
] as const;

export interface DesignResult {
  concepts: Concept[];
  /** Things the app removed or replaced because they broke the rules. */
  corrections: string[];
  cost: number | null;
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** ISQ names that at least one product actually has a value for. */
export function availableIsqNames(products: ConceptInputs["products"]): string[] {
  const seen = new Map<string, string>();
  for (const p of filledProducts(products)) {
    for (const row of parseSpecLines(p.specs)) {
      const key = row.name.toLowerCase();
      if (!seen.has(key)) seen.set(key, row.name);
    }
  }
  return [...seen.values()];
}

/** The design brief sent to the model: facts only, no product values beyond ISQ names. */
export function buildDesignBrief(
  inputs: ConceptInputs,
  mcat: { name: string; id: string },
): string {
  const inspected = inspectedEntries(inputs.benchmark);
  const patterns = countPatterns(inputs.benchmark);
  const data = ALL_BLOCKS.filter((b) => b !== "cta" && b !== "title").map((b) => {
    const { have, of } = countWithData(b, inputs.products, inputs.ctx);
    return `- ${b} (${BLOCK_LABELS[b]}): real data for ${have} of ${of} products`;
  });
  const ranking = (inputs.ranking ?? [])
    .filter((e) => e.dimension)
    .map(
      (e) =>
        `- ${e.raw.rank}. ${e.dimension}: ${levelText(e)}${e.show === false ? " (Show: No)" : ""}`,
    );
  const pages = inspected.slice(0, 20).map((e, i) => {
    const seen = e.observations
      .map((o) =>
        o.pattern === "other" ? `other: ${o.note}` : BENCHMARK_PATTERNS[o.pattern].label,
      )
      .join("; ");
    return `[${i + 1}] ${e.site} (${e.type}): ${seen}. Strengths: ${e.strengths.join("; ") || "-"}. For IndiaMART: ${e.applicability}`;
  });

  return `You design mobile product detail pages (PDPs) for IndiaMART, a B2B marketplace.
Category (MCAT): ${mcat.name}${mcat.id ? ` (ID ${mcat.id})` : ""}

How much buyers of this MCAT care about each part of a listing (IndiaMART data):
${ranking.length > 0 ? ranking.join("\n") : "- not available"}

Benchmark research on other marketplaces (${inspected.length} inspected pages):
Pattern frequency: ${patterns.map((p) => `${BENCHMARK_PATTERNS[p.pattern].label} ${p.pages}/${inspected.length}`).join(", ") || "none"}
${pages.join("\n") || "No inspected pages."}

Which page blocks have real data for the 5 products:
${data.join("\n")}
ISQ names available in the products: ${availableIsqNames(inputs.products).join(", ") || "none"}

Page blocks you can use (ids): ${ALL_BLOCKS.join(", ")}

IndiaMART Msite design guidelines (follow them; the pages are rendered in this style):
${IM_DESIGN_RULES.map((r) => `- ${r}`).join("\n")}
The mobile screen is the device height minus the ${IM_STICKY_BAR_HEIGHT}px sticky bar, so keep the first fold compact.

Design ${AI_CONCEPT_COUNT} genuinely different PDP layouts for this MCAT, each a distinct strategy grounded in the MCAT ranking and the benchmark findings. Return ONLY a JSON object:
{"concepts":[{
  "name": "<2-4 words>",
  "tagline": "<one sentence>",
  "bestFor": "<one sentence>",
  "firstFold": ["<block id>", ...],      // what the buyer sees before scrolling, in order (3-${MAX_FIRST_FOLD} blocks)
  "below": ["<block id>", ...],          // the rest, in order
  "keyIsq": ["<ISQ name>", ...],         // up to ${MAX_KEY_ISQ} ISQ names to feature, only from the list above
  "ctaPrimary": "<one of: ${CTA_LABELS.join(" | ")}>",
  "ctaSecondary": "<another of those>",
  "rationale": ["<why, citing MCAT ranking or benchmark pages like [3]>", ...],
  "benchmarkRefs": [<numbers of the benchmark pages this design draws on>]
}]}
Rules: never invent product facts, prices, ratings or features; only arrange and emphasise the blocks and ISQ names listed. Prefer blocks that have real data above the fold.`;
}

function parseJson(text: string): Record<string, unknown> | null {
  const t = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/, "");
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const v = JSON.parse(t.slice(start, end + 1)) as unknown;
    return typeof v === "object" && v !== null && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

const blockList = (v: unknown): BlockKind[] =>
  (Array.isArray(v) ? v : []).filter((b): b is BlockKind => ALL_BLOCKS.includes(b as BlockKind));

/**
 * Check the model's answer and turn it into exactly five concepts. Anything outside
 * the rules is dropped or replaced, and each correction is reported. Missing designs
 * are filled with the fixed strategies, marked as such.
 */
export function validateDesign(
  answer: Record<string, unknown> | null,
  inputs: ConceptInputs,
): { concepts: Concept[]; corrections: string[] } {
  const corrections: string[] = [];
  const isqNames = availableIsqNames(inputs.products);
  const isqByLower = new Map(isqNames.map((n) => [n.toLowerCase(), n]));
  const inspected = inspectedEntries(inputs.benchmark);
  const raw = Array.isArray(answer?.["concepts"]) ? (answer!["concepts"] as unknown[]) : [];
  if (!answer) corrections.push("The AI's answer could not be read.");

  const concepts: Concept[] = [];
  for (const item of raw.slice(0, AI_CONCEPT_COUNT)) {
    if (typeof item !== "object" || item === null) continue;
    const c = item as Record<string, unknown>;
    const n = concepts.length + 1;
    const name = str(c["name"], 40) || `AI design ${n}`;

    const offeredFirst = Array.isArray(c["firstFold"]) ? c["firstFold"].length : 0;
    let first = [...new Set(blockList(c["firstFold"]))].slice(0, MAX_FIRST_FOLD);
    if (first.length < offeredFirst)
      corrections.push(`${name}: unknown or extra above-the-fold blocks were removed.`);
    if (first.length === 0) {
      first = ["gallery", "title", "price", "cta"];
      corrections.push(`${name}: no valid above-the-fold blocks, so a standard order was used.`);
    }
    const layout = arrange(first, blockList(c["below"]));

    const keyIsq: string[] = [];
    for (const v of Array.isArray(c["keyIsq"]) ? c["keyIsq"] : []) {
      const real = typeof v === "string" ? isqByLower.get(v.trim().toLowerCase()) : undefined;
      if (real && !keyIsq.includes(real)) keyIsq.push(real);
      else if (typeof v === "string" && !real)
        corrections.push(`${name}: "${v}" is not an ISQ in the products and was dropped.`);
    }

    const label = (v: unknown, fallback: string) => {
      const s = str(v, 40);
      const match = CTA_LABELS.find((l) => l.toLowerCase() === s.toLowerCase());
      if (s && !match)
        corrections.push(
          `${name}: button label "${s}" is not an IndiaMART label; "${fallback}" was used.`,
        );
      return match ?? fallback;
    };
    const primary = label(c["ctaPrimary"], "Get Best Price");
    let secondary = label(c["ctaSecondary"], "Contact Supplier");
    if (secondary === primary)
      secondary = primary === "Contact Supplier" ? "Get Best Price" : "Contact Supplier";

    const refs = [
      ...new Set(
        (Array.isArray(c["benchmarkRefs"]) ? c["benchmarkRefs"] : [])
          .map((r) => Number(r))
          .filter((r) => Number.isInteger(r) && r >= 1 && r <= Math.min(inspected.length, 20)),
      ),
    ].map((r) => ({ site: inspected[r - 1]!.site, url: inspected[r - 1]!.url }));

    concepts.push({
      id: `ai-${n}`,
      name,
      tagline: str(c["tagline"], 160) || "AI-designed layout.",
      bestFor: str(c["bestFor"], 160) || "—",
      ...layout,
      source: "ai",
      keyIsq: keyIsq.slice(0, MAX_KEY_ISQ),
      cta: { primary, secondary },
      benchmarkRefs: refs,
      rationale: (Array.isArray(c["rationale"]) ? c["rationale"] : [])
        .map((r) => str(r, 300))
        .filter(Boolean)
        .slice(0, 4),
    });
  }

  if (concepts.length < AI_CONCEPT_COUNT) {
    if (answer)
      corrections.push(
        `The AI gave ${concepts.length} usable design(s); fixed strategies fill the rest.`,
      );
    const fixed = generateConcepts(inputs);
    for (const f of fixed) {
      if (concepts.length >= AI_CONCEPT_COUNT) break;
      concepts.push({ ...f, id: `ai-${concepts.length + 1}`, source: "fixed" });
    }
  }
  return { concepts, corrections };
}

/** Ask the model for five designs and validate them. Throws on setup or network errors. */
export async function designConcepts(options: {
  provider: AiProvider;
  settings: ProviderSettings;
  inputs: ConceptInputs;
  mcat: { name: string; id: string };
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}): Promise<DesignResult> {
  const { provider, settings, inputs, mcat, signal } = options;
  const fetchImpl = options.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const bad = checkBaseUrl(settings.baseUrl);
  if (bad) throw new Error(bad);
  if (!settings.apiKey.trim()) throw new Error("Add your AI key in Your AI key.");
  if (!settings.model.trim()) throw new Error("Choose a model in Your AI key.");

  const response = await fetchImpl(
    `${settings.baseUrl.trim().replace(/\/+$/, "")}/chat/completions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey.trim()}`,
        ...(provider === "openrouter" && typeof window !== "undefined"
          ? { "HTTP-Referer": window.location.origin, "X-Title": "PDP Genie" }
          : {}),
      },
      body: JSON.stringify({
        model: settings.model.trim(),
        messages: [{ role: "user", content: buildDesignBrief(inputs, mcat) }],
        response_format: { type: "json_object" },
        max_tokens: 4000,
        temperature: 0.4,
        ...(provider === "openrouter"
          ? { reasoning: { effort: "low", exclude: true }, usage: { include: true } }
          : {}),
      }),
      ...(signal ? { signal } : {}),
    },
  );
  if (!response.ok) {
    let detail = "";
    try {
      const err = (await response.json()) as { error?: { message?: unknown } };
      detail = typeof err.error?.message === "string" ? ` — ${err.error.message}` : "";
    } catch {
      /* not JSON */
    }
    throw new Error(`HTTP ${response.status}${detail}`);
  }
  const body = (await response.json()) as {
    choices?: { message?: { content?: unknown } }[];
    usage?: { cost?: unknown };
  };
  const content = body.choices?.[0]?.message?.content;
  const { concepts, corrections } = validateDesign(
    parseJson(typeof content === "string" ? content : ""),
    inputs,
  );
  const cost = typeof body.usage?.cost === "number" ? body.usage.cost : null;
  return { concepts, corrections, cost };
}
