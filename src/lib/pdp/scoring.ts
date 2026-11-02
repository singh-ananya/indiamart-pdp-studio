import { blockHasData } from "./block-data";
import { BENCHMARK_PATTERNS, countPatterns, type BenchmarkFile } from "./benchmark";
import { BLOCK_LABELS } from "./concepts";
import type { FoldReport } from "./devices";
import { placeMcatDimensions, type McatRankingEntry } from "./mcat-config";
import type { Concept, PdpContext, Product } from "./types";

/**
 * Transparent concept scoring. Every criterion is computed from something the app
 * measured or was given; nothing is estimated. A criterion with no input (e.g. no
 * benchmark imported) is left out and the remaining weights are rescaled, which
 * the breakdown says explicitly.
 */

export const SCORE_WEIGHTS = {
  mcat: 35,
  benchmark: 25,
  foldFit: 20,
  dataShown: 20,
} as const;

export type CriterionKey = keyof typeof SCORE_WEIGHTS;

export const CRITERION_LABELS: Record<CriterionKey, string> = {
  mcat: "MCAT priorities above the fold",
  benchmark: "Benchmark patterns matched",
  foldFit: "Planned first fold fits the screen",
  dataShown: "Real product data above the fold",
};

/** Level weights for the MCAT criterion; unrecognised levels are not scored. */
const LEVEL_WEIGHT = { high: 3, medium: 2, low: 1 } as const;
/** A dimension further down the page still helps, a little. */
const BELOW_FOLD_CREDIT = 0.25;

export interface CriterionScore {
  key: CriterionKey;
  label: string;
  weight: number;
  /** 0–100, or null when the input for it is missing. */
  score: number | null;
  detail: string;
}

export interface ConceptScore {
  conceptId: string;
  /** Weighted 0–100 over the criteria that could be scored. */
  total: number;
  criteria: CriterionScore[];
}

export interface ScoreInputs {
  ranking: McatRankingEntry[] | null;
  benchmark: BenchmarkFile | null;
  product: Product;
  ctx: PdpContext | null;
}

const pct = (value: number) => Math.round(value * 100);
const names = (kinds: string[]) => kinds.join(", ");

function scoreMcat(concept: Concept, report: FoldReport, ranking: McatRankingEntry[] | null) {
  const placements = placeMcatDimensions(
    ranking ?? [],
    [...concept.firstFold, ...concept.below],
    report.above,
  ).filter((p) => p.entry.level !== null);
  if (placements.length === 0) {
    return { score: null, detail: "No MCAT ranking for this MCAT — not scored." };
  }
  let earned = 0;
  let possible = 0;
  for (const { entry, status } of placements) {
    const w = LEVEL_WEIGHT[entry.level!];
    possible += w;
    earned += status === "above" ? w : status === "not-above" ? w * BELOW_FOLD_CREDIT : 0;
  }
  const missedHigh = placements
    .filter((p) => p.entry.level === "high" && p.status !== "above")
    .map((p) => p.entry.dimension);
  return {
    score: pct(earned / possible),
    detail:
      missedHigh.length > 0
        ? `High-importance below the fold: ${names(missedHigh)}.`
        : "Every High-importance dimension is above the fold.",
  };
}

function scoreBenchmark(concept: Concept, report: FoldReport, benchmark: BenchmarkFile | null) {
  const counts = countPatterns(benchmark);
  if (counts.length === 0) {
    return { score: null, detail: "No inspected benchmark pages for this MCAT — not scored." };
  }
  const layout = [...concept.firstFold, ...concept.below];
  let earned = 0;
  let possible = 0;
  const missed: string[] = [];
  for (const { pattern, pages } of counts) {
    const spec = BENCHMARK_PATTERNS[pattern];
    const blocks: readonly string[] = spec.blocks;
    const met =
      spec.placement === "first-fold"
        ? report.above.some((b) => blocks.includes(b))
        : layout.some((b) => blocks.includes(b));
    possible += pages;
    if (met) earned += pages;
    else missed.push(`${spec.label} (${pages})`);
  }
  return {
    score: pct(earned / possible),
    detail:
      missed.length > 0
        ? `Not matched (pages observed): ${missed.join("; ")}.`
        : "Matches every observed pattern.",
  };
}

function scoreFoldFit(concept: Concept, report: FoldReport) {
  const fits = concept.firstFold.filter((b) => report.above.includes(b));
  const missed = concept.firstFold.filter((b) => !report.above.includes(b));
  return {
    score: pct(fits.length / concept.firstFold.length),
    detail:
      missed.length > 0
        ? `Planned but not fully visible: ${names(missed.map((b) => BLOCK_LABELS[b]))}.`
        : `All ${concept.firstFold.length} planned blocks fit.`,
  };
}

function scoreDataShown(
  report: FoldReport,
  product: Product,
  ctx: PdpContext | null,
  keyIsq?: string[],
) {
  // The enquiry buttons are fixed UI, not data, so they are not counted.
  const blocks = report.above.filter((b) => b !== "cta");
  if (blocks.length === 0) {
    return { score: 0, detail: "No content block is fully above the fold." };
  }
  const empty = blocks.filter((b) => !blockHasData(b, product, ctx, keyIsq));
  return {
    score: pct((blocks.length - empty.length) / blocks.length),
    detail:
      empty.length > 0
        ? `Above the fold but "not provided" for this product: ${names(empty.map((b) => BLOCK_LABELS[b]))}.`
        : `All ${blocks.length} content blocks above the fold show real data.`,
  };
}

export function scoreConcept(
  concept: Concept,
  report: FoldReport,
  inputs: ScoreInputs,
): ConceptScore {
  const results: Record<CriterionKey, { score: number | null; detail: string }> = {
    mcat: scoreMcat(concept, report, inputs.ranking),
    benchmark: scoreBenchmark(concept, report, inputs.benchmark),
    foldFit: scoreFoldFit(concept, report),
    dataShown: scoreDataShown(report, inputs.product, inputs.ctx, concept.keyIsq),
  };
  const criteria = (Object.keys(SCORE_WEIGHTS) as CriterionKey[]).map((key) => ({
    key,
    label: CRITERION_LABELS[key],
    weight: SCORE_WEIGHTS[key],
    ...results[key],
  }));
  const scored = criteria.filter((c) => c.score !== null);
  const weight = scored.reduce((sum, c) => sum + c.weight, 0);
  const total = weight === 0 ? 0 : scored.reduce((sum, c) => sum + c.weight * c.score!, 0) / weight;
  return { conceptId: concept.id, total: Math.round(total), criteria };
}

/** Highest total first; ties keep the concepts' own order. */
export function rankScores(scores: ConceptScore[]): ConceptScore[] {
  return scores
    .map((s, i) => ({ s, i }))
    .sort((a, b) => b.s.total - a.s.total || a.i - b.i)
    .map(({ s }) => s);
}

/** Weight actually applied to each criterion after leaving out unscored ones. */
export function effectiveWeights(score: ConceptScore): Record<CriterionKey, number> {
  const scored = score.criteria.filter((c) => c.score !== null);
  const total = scored.reduce((sum, c) => sum + c.weight, 0);
  return Object.fromEntries(
    score.criteria.map((c) => [
      c.key,
      c.score === null || total === 0 ? 0 : Math.round((c.weight / total) * 100),
    ]),
  ) as Record<CriterionKey, number>;
}
