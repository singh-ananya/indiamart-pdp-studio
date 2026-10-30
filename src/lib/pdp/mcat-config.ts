import type { BlockKind } from "./types";

/**
 * MCAT configuration: the im-lite master file (server/McatContextJSON/mcatcontext.json).
 *
 * Shape: { version, mcats: { [mcatId]: { importance_ranking: [{ Dimension, Level, Rank, Show }] } } }
 *
 * The file ranks how much buyers care about each part of a listing. It holds no
 * MCAT names, product attributes or image URLs, so nothing here produces them.
 * Values are matched the way im-lite matches them (trimmed, lower-cased, exact);
 * misspelt values are kept as written and reported as unrecognised, never corrected.
 */

export const MCAT_DIMENSIONS = ["image", "specification", "price", "company", "unit"] as const;
export type McatDimension = (typeof MCAT_DIMENSIONS)[number];
export type McatLevel = "high" | "medium" | "low";

/** Generous ceiling; the current master file is ~32 MB. */
export const MAX_MCAT_CONFIG_BYTES = 100 * 1024 * 1024;
const MAX_REPORTED_ERRORS = 10;

export interface RawRankingEntry {
  Dimension: string;
  Level: string;
  Rank: string | number;
  Show: string;
}

export interface RawMcatRecord {
  importance_ranking: RawRankingEntry[];
}

export interface McatConfig {
  /** `version` from the file; empty when the file does not state one. */
  version: string;
  mcatCount: number;
  /** Validated records exactly as they appear in the file. */
  mcats: Readonly<Record<string, RawMcatRecord>>;
  /** Unrecognised values, summarised. The file is still accepted. */
  warnings: string[];
}

export interface McatRankingEntry {
  dimension: McatDimension | null;
  level: McatLevel | null;
  rank: number | null;
  show: boolean | null;
  /** Values as written in the file. */
  raw: { dimension: string; level: string; rank: string; show: string };
}

export type McatConfigParseResult =
  { ok: true; config: McatConfig } | { ok: false; errors: string[] };

const norm = (value: string | number) => String(value).trim().toLowerCase();

export function toDimension(value: string): McatDimension | null {
  const v = norm(value);
  return (MCAT_DIMENSIONS as readonly string[]).includes(v) ? (v as McatDimension) : null;
}

export function toLevel(value: string): McatLevel | null {
  const v = norm(value);
  return v === "high" || v === "medium" || v === "low" ? v : null;
}

export function toShow(value: string): boolean | null {
  const v = norm(value);
  if (v === "yes" || v === "true") return true;
  if (v === "no" || v === "false") return false;
  return null;
}

export function toRank(value: string | number): number | null {
  const v = norm(value);
  return /^\d+$/.test(v) ? Number(v) : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Parse and fully validate a configuration file. Never throws. */
export function parseMcatConfigText(text: string): McatConfigParseResult {
  if (text.trim() === "") return { ok: false, errors: ["File is empty"] };
  // String length counts UTF-16 units, which never exceeds the UTF-8 byte size of this data.
  if (text.length > MAX_MCAT_CONFIG_BYTES) {
    return { ok: false, errors: ["File is larger than 100 MB"] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return {
      ok: false,
      errors: [`Not valid JSON: ${error instanceof Error ? error.message : "parse error"}`],
    };
  }
  return validateMcatConfig(parsed);
}

type FieldName = keyof RawRankingEntry;
const FIELDS: FieldName[] = ["Dimension", "Level", "Rank", "Show"];
const RECOGNISERS: Record<FieldName, (value: string) => unknown> = {
  Dimension: toDimension,
  Level: toLevel,
  Rank: toRank,
  Show: toShow,
};

export function validateMcatConfig(raw: unknown): McatConfigParseResult {
  if (!isRecord(raw)) {
    return { ok: false, errors: ['Must be a JSON object with an "mcats" object'] };
  }
  const errors: string[] = [];
  let problemCount = 0;
  const report = (message: string) => {
    problemCount++;
    if (errors.length < MAX_REPORTED_ERRORS) errors.push(message);
  };

  const version = raw["version"];
  if (version !== undefined && typeof version !== "string" && typeof version !== "number") {
    report("version: must be a string");
  }
  const mcats = raw["mcats"];
  if (!isRecord(mcats)) {
    return {
      ok: false,
      errors: ["mcats: must be an object keyed by MCAT ID — is this mcatcontext.json?"],
    };
  }
  const ids = Object.keys(mcats);
  if (ids.length === 0) return { ok: false, errors: ["mcats: contains no MCATs"] };

  const unrecognised: Record<FieldName, Map<string, number>> = {
    Dimension: new Map(),
    Level: new Map(),
    Rank: new Map(),
    Show: new Map(),
  };

  for (const id of ids) {
    if (id.trim() === "") report("mcats: has an empty MCAT ID");
    const record = mcats[id];
    const ranking = isRecord(record) ? record["importance_ranking"] : undefined;
    if (!Array.isArray(ranking)) {
      report(`mcats.${id}: needs an "importance_ranking" array`);
      continue;
    }
    if (ranking.length === 0) {
      report(`mcats.${id}.importance_ranking: is empty`);
      continue;
    }
    ranking.forEach((entry: unknown, i) => {
      if (!isRecord(entry)) {
        report(`mcats.${id}.importance_ranking.${i}: must be an object`);
        return;
      }
      for (const field of FIELDS) {
        const value = entry[field];
        const valid = typeof value === "string" || (field === "Rank" && typeof value === "number");
        if (!valid) {
          report(`mcats.${id}.importance_ranking.${i}.${field}: must be a string`);
        } else if (RECOGNISERS[field](String(value)) === null) {
          const key = String(value);
          unrecognised[field].set(key, (unrecognised[field].get(key) ?? 0) + 1);
        }
      }
    });
  }

  if (problemCount > 0) {
    if (problemCount > errors.length) {
      errors.push(`…and ${problemCount - errors.length} more problem(s)`);
    }
    return { ok: false, errors };
  }

  const warnings: string[] = [];
  for (const field of FIELDS) {
    const counts = [...unrecognised[field]].sort((a, b) => b[1] - a[1]);
    if (counts.length === 0) continue;
    const total = counts.reduce((sum, [, n]) => sum + n, 0);
    const examples = counts
      .slice(0, 5)
      .map(([value, n]) => `"${value}" ×${n}`)
      .join(", ");
    warnings.push(
      `${total} ${field} value(s) not recognised and treated as unknown: ${examples}${counts.length > 5 ? ", …" : ""}`,
    );
  }

  return {
    ok: true,
    config: {
      version: version === undefined ? "" : String(version),
      mcatCount: ids.length,
      mcats: mcats as Record<string, RawMcatRecord>,
      warnings,
    },
  };
}

/** Hex SHA-256 of the exact file bytes; identifies a configuration version. */
export async function sha256Hex(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Normalise one MCAT's importance_ranking, keeping file order and the raw values. */
export function normalizeRanking(ranking: RawRankingEntry[]): McatRankingEntry[] {
  return ranking.map((entry) => ({
    dimension: toDimension(entry.Dimension),
    level: toLevel(entry.Level),
    rank: toRank(entry.Rank),
    show: toShow(entry.Show),
    raw: {
      dimension: entry.Dimension,
      level: entry.Level,
      rank: String(entry.Rank),
      show: entry.Show,
    },
  }));
}

/** The ranking for one MCAT, in file order, or null when the ID is not in the file. */
export function getMcatRanking(config: McatConfig, mcatId: string): McatRankingEntry[] | null {
  const id = mcatId.trim();
  if (!id || !Object.hasOwn(config.mcats, id)) return null;
  return normalizeRanking(config.mcats[id]!.importance_ranking);
}

const LEVEL_LABELS: Record<McatLevel, string> = { high: "High", medium: "Medium", low: "Low" };

/** Level as recognised, or the file's own value when it is not recognised. */
export function levelText(entry: McatRankingEntry): string {
  return entry.level ? LEVEL_LABELS[entry.level] : `"${entry.raw.level}" (unrecognised)`;
}

/** Same values im-lite stamps on pdpData.MCAT_IMG_CONTEXT; "" for every other MCAT. */
export type McatImageContext = "LOW_IMG_COMPANY_HIGH" | "LOW_IMG" | "";

/**
 * Mirrors buildLowImageIndex() in im-lite's server/McatContextJSON/mcatContext.js:
 * exact trimmed, lower-cased match, and a later entry for the same dimension wins.
 */
export function getMcatImageContext(ranking: McatRankingEntry[]): McatImageContext {
  let image = "";
  let company = "";
  for (const entry of ranking) {
    const dimension = norm(entry.raw.dimension);
    if (dimension === "image") image = norm(entry.raw.level);
    else if (dimension === "company") company = norm(entry.raw.level);
  }
  if (image !== "low") return "";
  return company === "high" ? "LOW_IMG_COMPANY_HIGH" : "LOW_IMG";
}

export const IMAGE_CONTEXT_LABELS: Record<McatImageContext, string> = {
  LOW_IMG_COMPANY_HIGH:
    "Low-image MCAT with company importance High — im-lite serves Template4 (different media block).",
  LOW_IMG: "Low-image MCAT — im-lite serves Template5 (different media block).",
  "": "Not a low-image MCAT — im-lite keeps its standard media block.",
};

/** Preview blocks that carry each dimension. Unit is shown inside the price block. */
export const DIMENSION_BLOCKS: Record<McatDimension, BlockKind[]> = {
  image: ["gallery"],
  specification: ["specs"],
  price: ["price"],
  unit: ["price"],
  company: ["seller", "trust"],
};

export type PlacementStatus = "above" | "not-above" | "not-in-layout";

export interface McatPlacement {
  entry: McatRankingEntry & { dimension: McatDimension };
  status: PlacementStatus;
}

/**
 * Where each ranked dimension lands in one concept: fully above the measured
 * fold, lower down, or not part of the layout at all.
 */
export function placeMcatDimensions(
  ranking: McatRankingEntry[],
  layoutBlocks: BlockKind[],
  aboveFold: BlockKind[],
): McatPlacement[] {
  return ranking
    .filter((entry): entry is McatPlacement["entry"] => entry.dimension !== null)
    .map((entry) => {
      const blocks = DIMENSION_BLOCKS[entry.dimension];
      const status: PlacementStatus = blocks.some((b) => aboveFold.includes(b))
        ? "above"
        : blocks.some((b) => layoutBlocks.includes(b))
          ? "not-above"
          : "not-in-layout";
      return { entry, status };
    });
}
