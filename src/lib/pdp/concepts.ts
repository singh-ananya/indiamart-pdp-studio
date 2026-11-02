import { countWithData } from "./block-data";
import {
  BENCHMARK_PATTERNS,
  countPatterns,
  inspectedEntries,
  type BenchmarkFile,
} from "./benchmark";
import {
  DIMENSION_BLOCKS,
  getMcatImageContext,
  levelText,
  type McatRankingEntry,
} from "./mcat-config";
import type { BlockKind, Concept, PdpContext, Product } from "./types";

export const BLOCK_LABELS: Record<BlockKind, string> = {
  gallery: "Gallery",
  title: "Title",
  price: "Price",
  cta: "Enquiry buttons",
  ratings: "Ratings",
  offer: "Offer strip",
  highlights: "Highlights",
  specs: "ISQ / specs",
  description: "Description",
  trust: "Trust signals",
  seller: "Seller card",
};

/** Every concept renders every block exactly once; leftovers are appended in this order. */
export const ALL_BLOCKS: BlockKind[] = [
  "gallery",
  "title",
  "price",
  "cta",
  "specs",
  "highlights",
  "ratings",
  "seller",
  "trust",
  "description",
  "offer",
];

export interface ConceptInputs {
  /** Selected MCAT's importance ranking; null when there is no MCAT configuration for it. */
  ranking: McatRankingEntry[] | null;
  /** Benchmark research for this MCAT; null when none was imported. */
  benchmark: BenchmarkFile | null;
  /** All five product cards. */
  products: Product[];
  ctx: PdpContext | null;
}

/** First-fold blocks as given; then `belowOrder`; then every remaining block. */
export function arrange(firstFold: BlockKind[], belowOrder: BlockKind[] = []) {
  const first = [...new Set(firstFold)];
  const below = [...new Set(belowOrder)].filter((b) => !first.includes(b));
  const rest = ALL_BLOCKS.filter((b) => !first.includes(b) && !below.includes(b));
  return { firstFold: first, below: [...below, ...rest] };
}

/** Title and gallery placement shared by the data-driven concepts. */
function leadWith(blocks: BlockKind[], withCta: boolean): BlockKind[] {
  const core = blocks.filter((b) => b !== "gallery" && b !== "title" && b !== "cta");
  const first: BlockKind[] = blocks.includes("gallery")
    ? ["gallery", "title", ...core]
    : ["title", ...core];
  return withCta ? [...first, "cta"] : first;
}

function coverage(label: string, kind: BlockKind, inputs: ConceptInputs): string {
  const { have, of } = countWithData(kind, inputs.products, inputs.ctx);
  return of === 0
    ? `${label}: no products filled in yet.`
    : `${label}: ${have} of ${of} products have it.`;
}

/** 1. Blocks ordered by the MCAT's own importance ranking. */
function mcatPriority(inputs: ConceptInputs): Concept {
  const base = {
    id: "mcat-priority",
    name: "MCAT Priority",
    tagline: "Blocks ordered by what this MCAT's buyers rank as most important.",
    bestFor: "Following the MCAT configuration as closely as possible.",
  };
  const ranked = (inputs.ranking ?? [])
    .filter(
      (e): e is McatRankingEntry & { dimension: NonNullable<McatRankingEntry["dimension"]> } =>
        Boolean(e.dimension),
    )
    .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  if (ranked.length === 0) {
    return {
      ...base,
      ...arrange(["gallery", "title", "price", "cta"]),
      rationale: [
        "No MCAT ranking available (no MCAT ID, or the ID is not in the configuration) — uses the standard catalogue order.",
      ],
    };
  }
  const shown = ranked.filter((e) => e.show !== false);
  const high = shown.filter((e) => e.level === "high");
  const lead = high.length > 0 ? high : shown.slice(0, 2);
  const rest = ranked.filter((e) => !lead.includes(e));
  const hidden = ranked.filter((e) => e.show === false);
  return {
    ...base,
    ...arrange(
      leadWith(
        lead.flatMap((e) => DIMENSION_BLOCKS[e.dimension]),
        true,
      ),
      rest.flatMap((e) => DIMENSION_BLOCKS[e.dimension]),
    ),
    rationale: [
      `First fold carries ${lead.map((e) => `${e.dimension} (${levelText(e)})`).join(", ")}${
        high.length === 0 ? " — no dimension is High, so the top two ranks lead" : ""
      }.`,
      `Then the rest by rank: ${rest.map((e) => e.dimension).join(" → ") || "none"}.`,
      ...(hidden.length > 0
        ? [
            `Show: No in the file for ${hidden.map((e) => e.dimension).join(", ")} — kept below the fold.`,
          ]
        : []),
    ],
  };
}

/** 2. What most of the inspected benchmark pages put before the fold. */
function benchmarkConsensus(inputs: ConceptInputs): Concept {
  const base = {
    id: "benchmark-consensus",
    name: "Benchmark Consensus",
    tagline: "Mirrors what most of the inspected benchmark pages show first.",
    bestFor: "Matching patterns buyers already know from other marketplaces.",
  };
  const pages = inspectedEntries(inputs.benchmark).length;
  if (pages === 0) {
    return {
      ...base,
      ...arrange(["title", "price", "highlights", "cta"]),
      rationale: [
        "No inspected benchmark pages for this MCAT — uses a compact text-led default until research is imported.",
      ],
    };
  }
  const counts = countPatterns(inputs.benchmark);
  const majority = Math.ceil(pages / 2);
  const leading = counts.filter(
    (c) => BENCHMARK_PATTERNS[c.pattern].placement === "first-fold" && c.pages >= majority,
  );
  const leadBlocks = leading.flatMap((c): BlockKind[] => [...BENCHMARK_PATTERNS[c.pattern].blocks]);
  const anywhere = counts
    .filter((c) => BENCHMARK_PATTERNS[c.pattern].placement === "anywhere")
    .flatMap((c): BlockKind[] => [...BENCHMARK_PATTERNS[c.pattern].blocks]);
  return {
    ...base,
    ...arrange(leadWith(leadBlocks, leadBlocks.includes("cta") || leading.length === 0), anywhere),
    rationale: [
      leading.length > 0
        ? `Before the fold on at least ${majority} of ${pages} inspected pages: ${leading
            .map((c) => `${BENCHMARK_PATTERNS[c.pattern].label} (${c.pages})`)
            .join(", ")}.`
        : `No before-the-fold pattern appears on at least half of the ${pages} inspected pages — title and enquiry buttons lead.`,
      "Below the fold, blocks follow how often each pattern was observed.",
    ],
  };
}

/** 3. Specifications and price before anything else. */
function specPriceFirst(inputs: ConceptInputs): Concept {
  const spec = inputs.ranking?.find((e) => e.dimension === "specification");
  const price = inputs.ranking?.find((e) => e.dimension === "price");
  const importance = [
    spec && `specification ${levelText(spec)}`,
    price && `price ${levelText(price)}`,
  ].filter(Boolean);
  return {
    id: "spec-price-first",
    name: "Spec & Price First",
    tagline: "Specification table and price above the fold for comparison buyers.",
    bestFor: "Industrial and B2B buyers who compare specs and rates before images.",
    ...arrange(["title", "specs", "price", "cta"], ["gallery", "highlights", "seller", "trust"]),
    rationale: [
      coverage("Specs", "specs", inputs),
      coverage("Price", "price", inputs),
      ...(importance.length > 0 ? [`MCAT importance: ${importance.join(", ")}.`] : []),
    ],
  };
}

/** 4. Seller credentials lead. */
function trustForward(inputs: ConceptInputs): Concept {
  const company = inputs.ranking?.find((e) => e.dimension === "company");
  const ctx = inputs.ctx;
  const signals = [
    ctx?.verifiedSupplier && "verified supplier",
    ctx?.gstVerified && "GST verified",
    ctx?.responseRate !== undefined && "response rate",
    ctx?.sellerRating !== undefined && "rating",
    ctx?.memberSince && "member since",
  ].filter(Boolean);
  return {
    id: "trust-forward",
    name: "Trust Forward",
    tagline: "Seller card and trust badges lead the page.",
    bestFor: "Building credibility with first-time buyers.",
    ...arrange(
      ["seller", "trust", "title", "price", "cta"],
      ["gallery", "ratings", "highlights", "specs"],
    ),
    rationale: [
      signals.length > 0
        ? `Trust signals provided in the context: ${signals.join(", ")}.`
        : "No trust signals in the context yet — the trust block shows 'not provided'.",
      ...(company ? [`MCAT importance: company ${levelText(company)}.`] : []),
    ],
  };
}

/** 5. Photos sell the product. */
function visualShowcase(inputs: ConceptInputs): Concept {
  const image = inputs.ranking?.find((e) => e.dimension === "image");
  const lowImage = inputs.ranking ? getMcatImageContext(inputs.ranking) !== "" : false;
  return {
    id: "visual-showcase",
    name: "Visual Showcase",
    tagline: "Image gallery and key highlights before the price.",
    bestFor: "Design-led products where photos sell the story.",
    ...arrange(["gallery", "title", "highlights", "cta"], ["price", "ratings", "specs"]),
    rationale: [
      coverage("Images", "gallery", inputs),
      ...(image ? [`MCAT importance: image ${levelText(image)}.`] : []),
      ...(lowImage
        ? [
            "Low-image MCAT: im-lite uses a different media block, so this concept goes against the MCAT data.",
          ]
        : []),
    ],
  };
}

/**
 * The five concepts, each a different strategy shaped by the inputs. Ids and names
 * are stable; block order and rationale depend on the data. Nothing is invented:
 * blocks without data still render their "not provided" slot.
 */
export function generateConcepts(inputs: ConceptInputs): Concept[] {
  const concepts = [
    mcatPriority(inputs),
    benchmarkConsensus(inputs),
    specPriceFirst(inputs),
    trustForward(inputs),
    visualShowcase(inputs),
  ];
  // The data can make two strategies land on the same first fold; say so rather than hide it.
  return concepts.map((concept, i) => {
    const twin = concepts.find(
      (other, j) => j < i && other.firstFold.join() === concept.firstFold.join(),
    );
    return twin
      ? {
          ...concept,
          rationale: [
            ...(concept.rationale ?? []),
            `With this data its first fold is the same as ${twin.name}.`,
          ],
        }
      : concept;
  });
}

/** The five concepts with no MCAT ranking, benchmark or product data (default orders). */
export const CONCEPTS: Concept[] = generateConcepts({
  ranking: null,
  benchmark: null,
  products: [],
  ctx: null,
});
