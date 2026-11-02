import { describe, expect, it } from "vitest";
import {
  countPatterns,
  isIndiaMartUrl,
  parseBenchmarkText,
  type BenchmarkFile,
} from "@/lib/pdp/benchmark";
import { latestPerMcat, newestValidPerMcat, type StoredBenchmark } from "@/lib/pdp/benchmark-store";
import { ALL_BLOCKS, CONCEPTS, generateConcepts } from "@/lib/pdp/concepts";
import { DEMO_PRODUCTS, EMPTY_PRODUCT } from "@/lib/pdp/demo-data";
import { buildFoldReport } from "@/lib/pdp/devices";
import { getMcatRanking, parseMcatConfigText } from "@/lib/pdp/mcat-config";
import { parsePdpContext } from "@/lib/pdp/schema";
import { effectiveWeights, rankScores, scoreConcept } from "@/lib/pdp/scoring";
import type { BlockKind, Concept } from "@/lib/pdp/types";

const inspected = (site: string, patterns: string[]) => ({
  site,
  type: "b2b",
  url: `https://${site.toLowerCase().replace(/\s/g, "")}.example/product/1`,
  status: "inspected",
  inspectedAt: "2026-11-02",
  observations: patterns.map((pattern) => ({
    pattern,
    note: `${pattern} seen`,
    evidence: `Quoted text for ${pattern}`,
  })),
  strengths: ["Clear layout"],
  applicability: "Relevant to IndiaMART mobile PDP.",
});

const fileJson = (entries: unknown[], overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    app: "indiamart-pdp-studio-benchmark",
    version: 1,
    mcat: { name: "Steel Pipes", id: "42" },
    researchedAt: "2026-11-02",
    method: "Web search, then each page opened and read.",
    entries,
    ...overrides,
  });

function parsed(text: string): BenchmarkFile {
  const result = parseBenchmarkText(text);
  if (!result.ok) throw new Error(result.errors.join("; "));
  return result.file;
}

describe("benchmark file validation", () => {
  it("accepts inspected and not-inspected pages and warns about fewer than 20", () => {
    const result = parseBenchmarkText(
      fileJson([
        inspected("Site A", ["gallery-first", "price-above-fold"]),
        {
          site: "Site B",
          type: "ecommerce",
          url: "https://b.example/p",
          status: "not-inspected",
          reason: "HTTP 403 (bot protection)",
        },
      ]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings.join(" ")).toMatch(/2 pages listed; the brief asks for 20/);
    expect(result.warnings.join(" ")).toMatch(/1 page\(s\) could not be inspected/);
  });

  it.each([
    ["not JSON", "{nope"],
    ["wrong app", fileJson([inspected("A", ["spec-table"])], { app: "other" })],
    ["no entries", fileJson([])],
    [
      "an inspected page without observations",
      fileJson([{ ...inspected("A", []), observations: [] }]),
    ],
    [
      "an observation without evidence",
      fileJson([
        {
          ...inspected("A", ["spec-table"]),
          observations: [{ pattern: "spec-table", note: "x", evidence: "" }],
        },
      ]),
    ],
    ["an unknown pattern", fileJson([inspected("A", ["made-up-pattern"])])],
    [
      "a not-inspected page without a reason",
      fileJson([
        { site: "B", type: "b2b", url: "https://b.example", status: "not-inspected", reason: "" },
      ]),
    ],
    [
      "a non-http URL",
      fileJson([{ ...inspected("A", ["spec-table"]), url: "javascript:alert(1)" }]),
    ],
    ["duplicate URLs", fileJson([inspected("A", ["spec-table"]), inspected("A", ["spec-table"])])],
  ])("rejects %s", (_label, text) => {
    const result = parseBenchmarkText(text);
    expect(result.ok).toBe(false);
  });

  it("rejects IndiaMART's own pages, on any subdomain, but not look-alike domains", () => {
    for (const url of [
      "https://m.indiamart.com/proddetail/32-inch-led-tv-2851707213873.html",
      "https://www.indiamart.com/p/x.html",
      "https://indiamart.com/x",
    ]) {
      const result = parseBenchmarkText(fileJson([{ ...inspected("A", ["spec-table"]), url }]));
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.errors[0]).toMatch(
        /is an IndiaMART page — benchmarks must come from other sites/,
      );
    }
    expect(isIndiaMartUrl("https://notindiamart.com/x")).toBe(false);
    expect(isIndiaMartUrl("https://indiamart.com.example.org/x")).toBe(false);
  });

  it("counts each pattern once per inspected page, ignoring 'other' and uninspected pages", () => {
    const file = parsed(
      fileJson([
        inspected("A", ["gallery-first", "gallery-first", "spec-table", "other"]),
        inspected("B", ["gallery-first"]),
        {
          site: "C",
          type: "b2b",
          url: "https://c.example",
          status: "not-inspected",
          reason: "Timeout",
        },
      ]),
    );
    expect(countPatterns(file)).toEqual([
      { pattern: "gallery-first", pages: 2 },
      { pattern: "spec-table", pages: 1 },
    ]);
  });

  it("keeps only the newest set per MCAT", () => {
    const file = parsed(fileJson([inspected("A", ["spec-table"])]));
    const sets: StoredBenchmark[] = [
      { id: 2, uploadedBy: "a", uploadedAt: "2026-11-02T10:00:00Z", file },
      { id: 1, uploadedBy: "a", uploadedAt: "2026-11-01T10:00:00Z", file },
    ];
    expect(latestPerMcat(sets).map((s) => s.id)).toEqual([2]);
  });

  it("reports only an invalid newest row; superseded invalid rows stay silent", () => {
    const good = JSON.parse(fileJson([inspected("A", ["spec-table"])])) as unknown;
    const withIndiaMart = JSON.parse(
      fileJson([{ ...inspected("A", ["spec-table"]), url: "https://m.indiamart.com/p/1.html" }]),
    ) as unknown;
    const row = (id: number, data: unknown) => ({
      id,
      mcat_id: "42",
      mcat_name: "Steel Pipes",
      data,
      uploaded_by: "a@indiamart.com",
      uploaded_at: `2026-11-0${id}T10:00:00Z`,
    });

    // Corrected file imported after the one with an IndiaMART page: no warning.
    const fixed = newestValidPerMcat([row(2, good), row(1, withIndiaMart)]);
    expect(fixed.sets.map((s) => s.id)).toEqual([2]);
    expect(fixed.skipped).toEqual([]);

    // Newest is invalid: hidden and reported, no fallback to the older file.
    const broken = newestValidPerMcat([row(2, withIndiaMart), row(1, good)]);
    expect(broken.sets).toEqual([]);
    expect(broken.skipped[0]).toMatch(
      /Saved research for Steel Pipes \(#2\) no longer passes validation/,
    );
  });
});

const ranking = getMcatRanking(
  (() => {
    const r = parseMcatConfigText(
      JSON.stringify({
        version: "v",
        mcats: {
          "42": {
            importance_ranking: [
              { Dimension: "specification", Level: "High", Rank: "1", Show: "Yes" },
              { Dimension: "price", Level: "High", Rank: "2", Show: "Yes" },
              { Dimension: "image", Level: "Medium", Rank: "3", Show: "Yes" },
              { Dimension: "company", Level: "Low", Rank: "4", Show: "Yes" },
              { Dimension: "unit", Level: "Low", Rank: "5", Show: "No" },
            ],
          },
        },
      }),
    );
    if (!r.ok) throw new Error("fixture");
    return r.config;
  })(),
  "42",
)!;

describe("concept generation", () => {
  const ctx = parsePdpContext("{}");

  it("always returns five distinct concepts that each render every block exactly once", () => {
    for (const concepts of [
      CONCEPTS,
      generateConcepts({ ranking, benchmark: null, products: DEMO_PRODUCTS, ctx }),
    ]) {
      expect(new Set(concepts.map((c) => c.id)).size).toBe(5);
      for (const c of concepts) {
        expect([...c.firstFold, ...c.below].sort()).toEqual([...ALL_BLOCKS].sort());
      }
    }
  });

  it("gives five different first folds when no data is available", () => {
    expect(new Set(CONCEPTS.map((c) => c.firstFold.join())).size).toBe(5);
    expect(CONCEPTS[0]!.rationale?.[0]).toMatch(/No MCAT ranking available/);
    expect(CONCEPTS[1]!.rationale?.[0]).toMatch(/No inspected benchmark pages/);
  });

  it("MCAT Priority leads with the MCAT's High dimensions in rank order", () => {
    const [priority] = generateConcepts({ ranking, benchmark: null, products: DEMO_PRODUCTS, ctx });
    expect(priority!.firstFold).toEqual(["title", "specs", "price", "cta"]);
    expect(priority!.rationale?.join(" ")).toMatch(/specification \(High\), price \(High\)/);
    expect(priority!.rationale?.join(" ")).toMatch(/Show: No in the file for unit/);
  });

  it("Benchmark Consensus puts majority first-fold patterns first", () => {
    const benchmark = parsed(
      fileJson([
        inspected("A", ["gallery-first", "price-above-fold", "spec-table"]),
        inspected("B", ["gallery-first", "price-above-fold"]),
        inspected("C", ["gallery-first", "ratings-near-title"]),
      ]),
    );
    const [, consensus] = generateConcepts({
      ranking: null,
      benchmark,
      products: DEMO_PRODUCTS,
      ctx,
    });
    expect(consensus!.firstFold).toEqual(["gallery", "title", "price"]);
    expect(consensus!.rationale?.[0]).toMatch(/at least 2 of 3 inspected pages/);
    expect(consensus!.below[0]).toBe("specs");
  });

  it("reports product data coverage instead of inventing it", () => {
    const concepts = generateConcepts({
      ranking: null,
      benchmark: null,
      products: [DEMO_PRODUCTS[0]!, { ...EMPTY_PRODUCT, id: "p2" }],
      ctx,
    });
    const visual = concepts.find((c) => c.id === "visual-showcase")!;
    expect(visual.rationale?.[0]).toBe("Images: 0 of 1 products have it.");
  });
});

describe("scoring", () => {
  const ctx = parsePdpContext("{}");
  const reportFor = (concept: Concept, above: BlockKind[]) =>
    buildFoldReport(
      [...concept.firstFold, ...concept.below].map((kind, i) => ({
        kind,
        top: above.includes(kind) ? 0 : 1000 + i,
        bottom: above.includes(kind) ? 100 : 1100 + i,
      })),
      640,
      concept.firstFold,
    );

  it("scores each criterion from the measured report and shows its reasoning", () => {
    const concept: Concept = {
      id: "t",
      name: "T",
      tagline: "",
      bestFor: "",
      firstFold: ["gallery", "title", "specs", "cta"],
      below: ["price", "seller", "trust"],
    };
    const report = reportFor(concept, ["gallery", "title", "cta"]);
    const score = scoreConcept(concept, report, {
      ranking,
      benchmark: null,
      product: DEMO_PRODUCTS[0]!,
      ctx,
    });
    const byKey = Object.fromEntries(score.criteria.map((c) => [c.key, c]));
    // spec High(3) below=0.75, price High(3) below=0.75, image Medium(2) above=2,
    // company Low(1) below=0.25, unit Low(1) below=0.25 → 4 / 10
    expect(byKey["mcat"]!.score).toBe(40);
    expect(byKey["mcat"]!.detail).toMatch(/High-importance below the fold: specification, price/);
    expect(byKey["benchmark"]!.score).toBeNull();
    expect(byKey["foldFit"]!.score).toBe(75);
    // gallery has no image URL in the demo product; title has data → 1 of 2
    expect(byKey["dataShown"]!.score).toBe(50);
    expect(byKey["dataShown"]!.detail).toMatch(/Gallery/);
    // benchmark left out: (35*40 + 20*75 + 20*50) / 75 = 52
    expect(score.total).toBe(52);
    expect(effectiveWeights(score)).toEqual({ mcat: 47, benchmark: 0, foldFit: 27, dataShown: 27 });
  });

  it("ranks by total, keeping concept order for ties", () => {
    const a = { conceptId: "a", total: 50, criteria: [] };
    const b = { conceptId: "b", total: 70, criteria: [] };
    const c = { conceptId: "c", total: 50, criteria: [] };
    expect(rankScores([a, b, c]).map((s) => s.conceptId)).toEqual(["b", "a", "c"]);
  });
});
