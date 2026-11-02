import { z } from "zod";
import { formatIssues } from "./schema";
import type { BlockKind } from "./types";

/**
 * Benchmark research file: real product detail pages that were actually opened and
 * inspected for one MCAT, with what was observed on each and the evidence for it.
 *
 * The studio never researches anything itself. A file is produced outside the app
 * (see README "Benchmark research") and imported. Pages that could not be opened
 * are kept in the file as "not-inspected" with the reason, never filled in.
 */

export const BENCHMARK_FILE_APP = "indiamart-pdp-studio-benchmark";
export const MAX_BENCHMARK_BYTES = 1_000_000;

/**
 * Observable PDP patterns. Each maps to the preview blocks that carry it, and says
 * whether the pattern is about being visible before scrolling ("first-fold") or
 * just being present on the page ("anywhere"). Anything else is recorded as "other"
 * and shown, but not scored.
 */
export const BENCHMARK_PATTERNS = {
  "gallery-first": {
    label: "Large image gallery at the top",
    blocks: ["gallery"],
    placement: "first-fold",
  },
  "price-above-fold": {
    label: "Price visible before scrolling",
    blocks: ["price"],
    placement: "first-fold",
  },
  "moq-or-bulk-pricing": {
    label: "MOQ or bulk / tier pricing shown",
    blocks: ["price"],
    placement: "anywhere",
  },
  "cta-above-fold": {
    label: "Enquiry or buy button before scrolling",
    blocks: ["cta"],
    placement: "first-fold",
  },
  "specs-above-fold": {
    label: "Key specifications before scrolling",
    blocks: ["specs"],
    placement: "first-fold",
  },
  "spec-table": {
    label: "Structured specification table",
    blocks: ["specs"],
    placement: "anywhere",
  },
  "ratings-near-title": {
    label: "Ratings shown near the title",
    blocks: ["ratings"],
    placement: "first-fold",
  },
  "key-highlights": {
    label: "Short key-feature bullets",
    blocks: ["highlights"],
    placement: "anywhere",
  },
  "seller-card": {
    label: "Seller / company details",
    blocks: ["seller"],
    placement: "anywhere",
  },
  "trust-badges": {
    label: "Verification or trust badges",
    blocks: ["trust"],
    placement: "anywhere",
  },
  "offer-banner": {
    label: "Offer or discount banner",
    blocks: ["offer"],
    placement: "anywhere",
  },
  "detailed-description": {
    label: "Long product description",
    blocks: ["description"],
    placement: "anywhere",
  },
} as const satisfies Record<
  string,
  { label: string; blocks: readonly BlockKind[]; placement: "first-fold" | "anywhere" }
>;

export type BenchmarkPatternId = keyof typeof BENCHMARK_PATTERNS;
export const BENCHMARK_PATTERN_IDS = Object.keys(BENCHMARK_PATTERNS) as BenchmarkPatternId[];

const httpUrl = z
  .string()
  .trim()
  .url("must be a valid URL")
  .refine((u) => /^https?:\/\//i.test(u), "must start with http:// or https://");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}/, "must be a date like 2026-11-02");
const text = z.string().trim().min(1, "cannot be empty");

const ObservationSchema = z.object({
  pattern: z.enum(
    [...(BENCHMARK_PATTERN_IDS as [BenchmarkPatternId, ...BenchmarkPatternId[]]), "other"],
    {
      errorMap: () => ({
        message: `must be one of: ${BENCHMARK_PATTERN_IDS.join(", ")}, other`,
      }),
    },
  ),
  /** What was seen, in the researcher's words. */
  note: text,
  /** Quoted page text or a precise description of where it appears. */
  evidence: text,
});

const InspectedEntrySchema = z.object({
  site: text,
  type: z.enum(["b2b", "ecommerce"]),
  url: httpUrl,
  status: z.literal("inspected"),
  inspectedAt: isoDate,
  observations: z
    .array(ObservationSchema)
    .min(1, "an inspected page needs at least one observation"),
  strengths: z.array(text).default([]),
  applicability: text,
});

const NotInspectedEntrySchema = z.object({
  site: text,
  /** "unknown" when the page could not be read well enough to tell. */
  type: z.enum(["b2b", "ecommerce", "unknown"]),
  url: httpUrl,
  status: z.literal("not-inspected"),
  /** Why the page could not be opened, e.g. "HTTP 403 (bot protection)". */
  reason: text,
});

const EntrySchema = z.discriminatedUnion("status", [InspectedEntrySchema, NotInspectedEntrySchema]);

const BenchmarkFileSchema = z.object({
  app: z.literal(BENCHMARK_FILE_APP, {
    errorMap: () => ({ message: `must be "${BENCHMARK_FILE_APP}" — is this a benchmark file?` }),
  }),
  version: z.literal(1, { errorMap: () => ({ message: "unsupported benchmark file version" }) }),
  mcat: z.object({ name: text, id: z.string().trim().default("") }),
  researchedAt: isoDate,
  /** How the research was done, shown on the Sources tab. */
  method: text,
  entries: z.array(EntrySchema).min(1, "needs at least one entry").max(50, "at most 50 entries"),
});

export type BenchmarkFile = z.output<typeof BenchmarkFileSchema>;
export type BenchmarkEntry = BenchmarkFile["entries"][number];
export type InspectedEntry = Extract<BenchmarkEntry, { status: "inspected" }>;

/** True for indiamart.com and any of its subdomains (m., dir., www. …). */
export function isIndiaMartUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "indiamart.com" || host.endsWith(".indiamart.com");
  } catch {
    return false;
  }
}

export type BenchmarkParseResult =
  { ok: true; file: BenchmarkFile; warnings: string[] } | { ok: false; errors: string[] };

export function validateBenchmarkFile(raw: unknown): BenchmarkParseResult {
  const result = BenchmarkFileSchema.safeParse(raw);
  if (!result.success) return { ok: false, errors: formatIssues(result.error) };
  const file = result.data;

  const seen = new Set<string>();
  const duplicates = file.entries
    .map((e) =>
      e.url
        .replace(/[#?].*$/, "")
        .replace(/\/$/, "")
        .toLowerCase(),
    )
    .filter((url) => (seen.has(url) ? true : (seen.add(url), false)));
  if (duplicates.length > 0) {
    return { ok: false, errors: duplicates.map((url) => `entries: duplicate URL ${url}`) };
  }

  // IndiaMART is the site being improved; its own pages are never a benchmark.
  const ownPages = file.entries.filter((e) => isIndiaMartUrl(e.url));
  if (ownPages.length > 0) {
    return {
      ok: false,
      errors: ownPages.map(
        (e) => `entries: ${e.url} is an IndiaMART page — benchmarks must come from other sites`,
      ),
    };
  }

  const warnings: string[] = [];
  const inspected = file.entries.filter((e) => e.status === "inspected").length;
  if (file.entries.length < 20) {
    warnings.push(`${file.entries.length} pages listed; the brief asks for 20.`);
  }
  if (inspected < file.entries.length) {
    warnings.push(
      `${file.entries.length - inspected} page(s) could not be inspected and are not scored.`,
    );
  }
  return { ok: true, file, warnings };
}

/** Parse imported file text. Never throws. */
export function parseBenchmarkText(textValue: string): BenchmarkParseResult {
  if (new Blob([textValue]).size > MAX_BENCHMARK_BYTES) {
    return { ok: false, errors: ["File is larger than 1 MB"] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(textValue);
  } catch (error) {
    return {
      ok: false,
      errors: [`Not valid JSON: ${error instanceof Error ? error.message : "parse error"}`],
    };
  }
  return validateBenchmarkFile(parsed);
}

export function inspectedEntries(file: BenchmarkFile | null): InspectedEntry[] {
  return file ? file.entries.filter((e): e is InspectedEntry => e.status === "inspected") : [];
}

export interface PatternCount {
  pattern: BenchmarkPatternId;
  /** Inspected pages where the pattern was observed (counted once per page). */
  pages: number;
}

/** How many inspected pages show each pattern, most common first. */
export function countPatterns(file: BenchmarkFile | null): PatternCount[] {
  const counts = new Map<BenchmarkPatternId, number>();
  for (const entry of inspectedEntries(file)) {
    const onPage = new Set(
      entry.observations
        .map((o) => o.pattern)
        .filter((p): p is BenchmarkPatternId => p !== "other"),
    );
    for (const pattern of onPage) counts.set(pattern, (counts.get(pattern) ?? 0) + 1);
  }
  return [...counts]
    .map(([pattern, pages]) => ({ pattern, pages }))
    .sort(
      (a, b) =>
        b.pages - a.pages ||
        BENCHMARK_PATTERN_IDS.indexOf(a.pattern) - BENCHMARK_PATTERN_IDS.indexOf(b.pattern),
    );
}

/** True when this benchmark set is for the given MCAT (by ID when both have one, else by name). */
export function benchmarkMatchesMcat(
  file: BenchmarkFile,
  mcatId: string,
  mcatName: string,
): boolean {
  const id = mcatId.trim();
  if (id && file.mcat.id) return file.mcat.id === id;
  return file.mcat.name.trim().toLowerCase() === mcatName.trim().toLowerCase();
}
