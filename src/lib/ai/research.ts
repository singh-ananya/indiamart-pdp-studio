import {
  BENCHMARK_FILE_APP,
  BENCHMARK_PATTERNS,
  isIndiaMartUrl,
  type BenchmarkPatternId,
} from "@/lib/pdp/benchmark";
import { AI_PROVIDERS, checkBaseUrl, type AiProvider, type ProviderSettings } from "./providers";

/**
 * In-app benchmark research with the user's own OpenRouter key.
 *
 * 1. Web search (OpenRouter "web" plugin, Exa engine). Candidate pages come ONLY from
 *    the search engine's url_citation annotations, never from the model's text.
 * 2. Each page is read from the excerpt the search engine returned for it, and the
 *    model is asked for observations with quoted evidence.
 * 3. An observation is kept only if its evidence appears word-for-word in that
 *    excerpt. Pages with nothing verifiable are kept as "not-inspected" with the reason.
 *
 * Excerpts do not show page layout, so "before scrolling" patterns are never recorded.
 */

export const RESEARCH_TARGET = 20;
const RESULTS_PER_SEARCH = 10;
const EXCLUDED_DOMAINS = ["indiamart.com", "*.indiamart.com"];

/** Patterns that can be judged from page text alone (no layout needed). */
export const TEXT_PATTERNS = (Object.keys(BENCHMARK_PATTERNS) as BenchmarkPatternId[]).filter(
  (id) => BENCHMARK_PATTERNS[id].placement === "anywhere",
);

export interface Candidate {
  url: string;
  title: string;
  /** The search engine's excerpt of the page; empty when none was returned. */
  content: string;
}

export interface ResearchInput {
  mcatName: string;
  mcatId: string;
  productNames: string[];
}

export type ResearchProgress =
  | { stage: "searching"; done: number; total: number }
  | { stage: "reading"; done: number; total: number }
  | { stage: "finished" };

export interface ResearchResult {
  /** A benchmark file object, ready for validation and saving. */
  file: Record<string, unknown>;
  /** US dollars as reported by OpenRouter, when it reported usage. */
  cost: number | null;
  /** Observations the model offered that were dropped because their quote was not on the page. */
  droppedObservations: number;
}

interface ChatResponse {
  choices?: {
    message?: {
      content?: unknown;
      annotations?: {
        type?: string;
        url_citation?: { url?: unknown; title?: unknown; content?: unknown };
      }[];
    };
  }[];
  usage?: { cost?: unknown };
}

const endpoint = (baseUrl: string) => `${baseUrl.trim().replace(/\/+$/, "")}/chat/completions`;

async function chat(
  settings: ProviderSettings,
  body: Record<string, unknown>,
  fetchImpl: typeof fetch,
  signal?: AbortSignal,
): Promise<ChatResponse> {
  const response = await fetchImpl(endpoint(settings.baseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey.trim()}`,
      ...(typeof window !== "undefined"
        ? { "HTTP-Referer": window.location.origin, "X-Title": "PDP Genie" }
        : {}),
    },
    body: JSON.stringify({
      model: settings.model.trim(),
      // Keep reasoning short and out of the reply; report the real cost back.
      reasoning: { effort: "low", exclude: true },
      usage: { include: true },
      ...body,
    }),
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) {
    let detail = "";
    try {
      const err = (await response.json()) as { error?: { message?: unknown } };
      detail = typeof err.error?.message === "string" ? ` â€” ${err.error.message}` : "";
    } catch {
      /* not JSON */
    }
    throw new Error(`HTTP ${response.status}${detail}`);
  }
  return (await response.json()) as ChatResponse;
}

const costOf = (r: ChatResponse) =>
  typeof r.usage?.cost === "number" && Number.isFinite(r.usage.cost) ? r.usage.cost : null;

/** Search queries built from the user's inputs only. */
export function buildQueries({ mcatName, productNames }: ResearchInput): string[] {
  const names = productNames.map((n) => n.trim()).filter(Boolean);
  const queries = [
    `${mcatName} product page price specifications buy online`,
    `${mcatName} manufacturer supplier wholesale price MOQ product details`,
  ];
  if (names.length > 0) queries.push(`${names.slice(0, 3).join(", ")} ${mcatName} product page`);
  else queries.push(`${mcatName} B2B marketplace product listing specifications`);
  return queries;
}

/** Pull candidate pages out of url_citation annotations, dropping IndiaMART and duplicates. */
export function candidatesFrom(response: ChatResponse): Candidate[] {
  const annotations = response.choices?.[0]?.message?.annotations ?? [];
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const a of annotations) {
    if (a.type !== "url_citation") continue;
    const url = typeof a.url_citation?.url === "string" ? a.url_citation.url.trim() : "";
    if (!/^https?:\/\//i.test(url) || isIndiaMartUrl(url)) continue;
    const key = url
      .replace(/[#?].*$/, "")
      .replace(/\/$/, "")
      .toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      url,
      title: typeof a.url_citation?.title === "string" ? a.url_citation.title : "",
      content: typeof a.url_citation?.content === "string" ? a.url_citation.content : "",
    });
  }
  return out;
}

export function siteName(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return url;
  }
}

const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/[â€˜â€™]/g, "'")
    .replace(/[â€œâ€]/g, '"')
    .replace(/\s+/g, " ")
    .trim();

/** True when the quote appears in the page text (case and whitespace insensitive). */
export function quoteIsOnPage(quote: string, pageText: string): boolean {
  const q = normalize(quote);
  return q.length >= 6 && normalize(pageText).includes(q);
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const value = JSON.parse(trimmed.slice(start, end + 1)) as unknown;
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export type PageVerdict =
  { kind: "not-product" } | { kind: "entry"; entry: Record<string, unknown>; dropped: number };

const today = () => new Date().toISOString().slice(0, 10);
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/**
 * Turn the model's analysis of one page into a benchmark entry, keeping only
 * observations whose evidence is really in the page excerpt.
 */
export function verifyAnalysis(
  analysis: Record<string, unknown> | null,
  page: Candidate,
): PageVerdict {
  const base = { site: siteName(page.url), url: page.url };
  if (!analysis) {
    return {
      kind: "entry",
      dropped: 0,
      entry: {
        ...base,
        type: "unknown",
        status: "not-inspected",
        reason: "The AI's analysis could not be read.",
      },
    };
  }
  if (analysis["isProductPage"] === false) return { kind: "not-product" };
  const type = analysis["type"] === "b2b" ? "b2b" : "ecommerce";

  const offered = Array.isArray(analysis["observations"]) ? analysis["observations"] : [];
  const kept: { pattern: string; note: string; evidence: string }[] = [];
  let dropped = 0;
  for (const raw of offered) {
    const o = (raw ?? {}) as Record<string, unknown>;
    const pattern = str(o["pattern"]);
    const note = str(o["note"]);
    const evidence = str(o["evidence"]);
    const allowed = (TEXT_PATTERNS as string[]).includes(pattern) || pattern === "other";
    if (allowed && note && evidence && quoteIsOnPage(evidence, page.content)) {
      kept.push({ pattern, note, evidence });
    } else {
      dropped++;
    }
  }
  if (kept.length === 0) {
    return {
      kind: "entry",
      dropped,
      entry: {
        ...base,
        type,
        status: "not-inspected",
        reason:
          offered.length > 0
            ? "None of the AI's quoted evidence appears in the page text, so nothing was recorded."
            : "No observable PDP patterns in the page text the search returned.",
      },
    };
  }
  const strengths = (Array.isArray(analysis["strengths"]) ? analysis["strengths"] : [])
    .map(str)
    .filter(Boolean)
    .slice(0, 3);
  return {
    kind: "entry",
    dropped,
    entry: {
      ...base,
      type,
      status: "inspected",
      inspectedAt: today(),
      observations: kept.slice(0, 8),
      strengths,
      applicability: str(analysis["applicability"]) || "No applicability note was produced.",
    },
  };
}

function analysisPrompt(page: Candidate, mcatName: string): string {
  const patterns = TEXT_PATTERNS.map((id) => `- ${id}: ${BENCHMARK_PATTERNS[id].label}`).join("\n");
  return `You review product detail pages for IndiaMART's PDP design team.
Category: ${mcatName}
Page URL: ${page.url}
Page title: ${page.title}

Below is TEXT FROM THE PAGE (an excerpt returned by a search engine). Use only this text.

<page_text>
${page.content}
</page_text>

Return ONLY a JSON object:
{
  "isProductPage": true | false,   // false if this is a listing, search, category, article or comparison page
  "type": "b2b" | "ecommerce",
  "observations": [ { "pattern": "<id>", "note": "<what the page shows, in plain words>", "evidence": "<exact words copied from page_text>" } ],
  "strengths": ["<short strength>"],
  "applicability": "<1-2 sentences: how this could apply to an IndiaMART mobile product page for this category>"
}

Allowed pattern ids (or "other"):
${patterns}

Rules: "evidence" must be copied character-for-character from page_text (6-200 characters). Never guess or add facts that are not in page_text. If you cannot quote it, leave it out. At most 6 observations.`;
}

/** Run the full research. Throws only for setup problems; per-page failures become entries. */
export async function runBenchmarkResearch(options: {
  provider: AiProvider;
  settings: ProviderSettings;
  input: ResearchInput;
  fetchImpl?: typeof fetch;
  onProgress?: (p: ResearchProgress) => void;
  signal?: AbortSignal;
}): Promise<ResearchResult> {
  const { provider, settings, input, onProgress, signal } = options;
  const fetchImpl = options.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  if (provider !== "openrouter") {
    throw new Error(
      "Web research needs OpenRouter (it provides the web search). Switch the provider to OpenRouter.",
    );
  }
  const bad = checkBaseUrl(settings.baseUrl);
  if (bad) throw new Error(bad);
  if (!settings.apiKey.trim()) throw new Error(`Enter your ${AI_PROVIDERS[provider].keyLabel}.`);
  if (!settings.model.trim()) throw new Error("Choose a model.");
  if (!input.mcatName.trim()) throw new Error("Enter the MCAT name first.");

  let cost: number | null = null;
  const addCost = (r: ChatResponse) => {
    const c = costOf(r);
    if (c !== null) cost = (cost ?? 0) + c;
  };

  // 1. Search.
  const queries = buildQueries(input);
  const candidates: Candidate[] = [];
  const seen = new Set<string>();
  for (const [i, query] of queries.entries()) {
    onProgress?.({ stage: "searching", done: i, total: queries.length });
    const response = await chat(
      settings,
      {
        messages: [
          {
            role: "system",
            content:
              "List every web search result you were given as one line each: the page title and its URL. Do not add anything else.",
          },
          { role: "user", content: query },
        ],
        plugins: [
          {
            id: "web",
            engine: "exa",
            max_results: RESULTS_PER_SEARCH,
            exclude_domains: EXCLUDED_DOMAINS,
          },
        ],
        max_tokens: 1200,
      },
      fetchImpl,
      signal,
    );
    addCost(response);
    for (const c of candidatesFrom(response)) {
      const key = c.url
        .replace(/[#?].*$/, "")
        .replace(/\/$/, "")
        .toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        candidates.push(c);
      }
    }
  }

  // 2. Read and verify each page until we have the target number of product pages.
  const entries: Record<string, unknown>[] = [];
  let droppedObservations = 0;
  for (const [i, page] of candidates.entries()) {
    if (entries.length >= RESEARCH_TARGET) break;
    if (signal?.aborted) throw new DOMException("Research cancelled", "AbortError");
    onProgress?.({ stage: "reading", done: i, total: candidates.length });
    if (!page.content.trim()) {
      entries.push({
        site: siteName(page.url),
        type: "unknown",
        url: page.url,
        status: "not-inspected",
        reason: "The search returned no page text for this result.",
      });
      continue;
    }
    let verdict: PageVerdict;
    try {
      const response = await chat(
        settings,
        {
          messages: [{ role: "user", content: analysisPrompt(page, input.mcatName) }],
          response_format: { type: "json_object" },
          max_tokens: 1500,
          temperature: 0,
        },
        fetchImpl,
        signal,
      );
      addCost(response);
      const content = response.choices?.[0]?.message?.content;
      verdict = verifyAnalysis(parseJsonObject(typeof content === "string" ? content : ""), page);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      verdict = {
        kind: "entry",
        dropped: 0,
        entry: {
          site: siteName(page.url),
          type: "unknown",
          url: page.url,
          status: "not-inspected",
          reason: `Analysis failed: ${error instanceof Error ? error.message : "unknown error"}`,
        },
      };
    }
    if (verdict.kind === "entry") {
      entries.push(verdict.entry);
      droppedObservations += verdict.dropped;
    }
  }
  onProgress?.({ stage: "finished" });

  if (entries.length === 0) {
    throw new Error(
      "The web search found no product pages for this MCAT. Try a more specific MCAT name or product names.",
    );
  }

  return {
    cost,
    droppedObservations,
    file: {
      app: BENCHMARK_FILE_APP,
      version: 1,
      mcat: { name: input.mcatName.trim(), id: input.mcatId.trim() },
      researchedAt: today(),
      method: `Automated in PDP Genie with OpenRouter web search (Exa) for: ${queries
        .map((q) => `"${q}"`)
        .join(
          "; ",
        )}. Each page was read from the search engine's text excerpt of it (not a full page load or a rendered screen) and analysed by ${settings.model.trim()}. An observation was kept only if its quoted evidence appears word-for-word in that excerpt; ${droppedObservations} unverifiable observation(s) were dropped. Before-the-fold patterns are not recorded because excerpts do not show page layout. IndiaMART pages were excluded.`,
      entries,
    },
  };
}
