import { z } from "zod";
import { ALL_BLOCKS, CONCEPTS } from "./concepts";
import { DEFAULT_CONTEXT_JSON, DEFAULT_MCAT, DEMO_PRODUCTS, EMPTY_PRODUCT } from "./demo-data";
import { formatIssues, ProductInputSchema, toProduct, validatePdpContext } from "./schema";
import type { BlockKind, Concept, DeviceMode, FoldMode, Product } from "./types";

export const PRODUCT_SLOTS = 5;
export const STORAGE_KEY = "indiamart-pdp-studio:v1";
/** Where unreadable saved data is moved before it would be overwritten. */
export const STORAGE_BACKUP_KEY = `${STORAGE_KEY}:unreadable-backup`;
export const MAX_IMPORT_BYTES = 1_000_000;
export const STUDIO_FILE_APP = "indiamart-pdp-studio";

export interface Viewport {
  width: number;
  height: number;
}

export interface StudioSnapshot {
  mcat: string;
  /** MCAT ID looked up in the active MCAT configuration; empty when not set. */
  mcatId: string;
  contextJson: string;
  products: Product[];
}

export interface StudioState {
  mcat: string;
  mcatId: string;
  contextJson: string;
  products: Product[];
  device: DeviceMode;
  fold: FoldMode;
  viewports: Record<DeviceMode, Viewport>;
  /** Index into the snapshot's products shown by all five concepts. */
  previewProductIndex: number;
  snapshot: StudioSnapshot | null;
  preferredId: string | null;
  benchmarkNotes: string;
  /** The AI's five designs for the current snapshot; null when not generated. */
  aiDesign: AiDesign | null;
}

export interface AiDesign {
  concepts: Concept[];
  model: string;
  /** ISO timestamp. */
  createdAt: string;
  /** What the app removed or replaced in the AI's answer. */
  corrections: string[];
  /** US dollars reported by the provider, when it reported it. */
  cost: number | null;
  /** How many inspected benchmark pages the design brief contained. */
  benchmarkPages: number;
}

export const DEFAULT_VIEWPORTS: Record<DeviceMode, Viewport> = {
  mobile: { width: 360, height: 640 },
  desktop: { width: 1366, height: 768 },
};

export const EMPTY_CONTEXT_JSON = "{}";

function emptyProducts(): Product[] {
  return Array.from({ length: PRODUCT_SLOTS }, (_, i) => ({
    ...EMPTY_PRODUCT,
    id: `p${i + 1}`,
    imageUrls: [],
  }));
}

/** An empty brief: the studio shows only real data the user enters or fetches. */
export function createDefaultState(): StudioState {
  return {
    mcat: "",
    mcatId: "",
    contextJson: EMPTY_CONTEXT_JSON,
    products: emptyProducts(),
    device: "mobile",
    fold: "first",
    viewports: {
      mobile: { ...DEFAULT_VIEWPORTS.mobile },
      desktop: { ...DEFAULT_VIEWPORTS.desktop },
    },
    previewProductIndex: 0,
    snapshot: null,
    preferredId: null,
    benchmarkNotes: "",
    aiDesign: null,
  };
}

const conceptIds = CONCEPTS.map((c) => c.id);

/** Pad or reject product lists so the studio always has exactly five slots. */
function normalizeProducts(inputs: z.output<typeof ProductInputSchema>[]): Product[] {
  const products = inputs.slice(0, PRODUCT_SLOTS).map((input, i) => toProduct(input, i));
  while (products.length < PRODUCT_SLOTS) {
    products.push({ ...EMPTY_PRODUCT, id: `p${products.length + 1}`, imageUrls: [] });
  }
  return products;
}

const ViewportSchema = z.object({
  width: z.number().int().min(240).max(3840),
  height: z.number().int().min(320).max(2400),
});

const ProductsSchema = z
  .array(ProductInputSchema)
  .min(1, "needs at least one product")
  .max(PRODUCT_SLOTS, `at most ${PRODUCT_SLOTS} products`);

// ---------------------------------------------------------------------------
// Browser storage (versioned; newer fields have defaults so old saves still load)
// ---------------------------------------------------------------------------

/** Version 2 added mcatId; version 3 added aiDesign. Older saves load with defaults. */
export const STORAGE_VERSION = 3;

const BlockKindSchema = z.enum(ALL_BLOCKS as [BlockKind, ...BlockKind[]]);
const StoredConceptSchema = z.object({
  id: z.string(),
  name: z.string(),
  tagline: z.string(),
  bestFor: z.string(),
  firstFold: z.array(BlockKindSchema).min(1),
  below: z.array(BlockKindSchema),
  rationale: z.array(z.string()).optional(),
  source: z.enum(["ai", "fixed"]).optional(),
  keyIsq: z.array(z.string()).optional(),
  cta: z.object({ primary: z.string(), secondary: z.string() }).optional(),
  benchmarkRefs: z
    .array(z.object({ site: z.string(), url: z.string().regex(/^https?:\/\//i) }))
    .optional(),
});

/** Rebuild a concept without undefined optional fields. */
function toConcept(c: z.output<typeof StoredConceptSchema>): Concept {
  return {
    id: c.id,
    name: c.name,
    tagline: c.tagline,
    bestFor: c.bestFor,
    firstFold: c.firstFold,
    below: c.below,
    ...(c.rationale ? { rationale: c.rationale } : {}),
    ...(c.source ? { source: c.source } : {}),
    ...(c.keyIsq ? { keyIsq: c.keyIsq } : {}),
    ...(c.cta ? { cta: c.cta } : {}),
    ...(c.benchmarkRefs ? { benchmarkRefs: c.benchmarkRefs } : {}),
  };
}

const StoredAiDesignSchema = z.object({
  concepts: z.array(StoredConceptSchema).length(5),
  model: z.string(),
  createdAt: z.string(),
  corrections: z.array(z.string()),
  cost: z.number().nullable(),
  benchmarkPages: z.number().int().min(0),
});

/** Ids the preferred concept may have: fixed strategies or the AI's five. */
const isConceptId = (id: string) => conceptIds.includes(id) || /^ai-[1-5]$/.test(id);

const StoredStateSchema = z.object({
  version: z.union([z.literal(1), z.literal(2), z.literal(STORAGE_VERSION)]),
  // An unreadable AI design is dropped rather than making the whole save unreadable.
  aiDesign: StoredAiDesignSchema.nullable().catch(null).default(null),
  mcat: z.string(),
  mcatId: z.string().default(""),
  contextJson: z.string(),
  products: ProductsSchema,
  device: z.enum(["mobile", "desktop"]),
  fold: z.enum(["first", "full"]),
  viewports: z
    .object({ mobile: ViewportSchema, desktop: ViewportSchema })
    .default(DEFAULT_VIEWPORTS),
  previewProductIndex: z
    .number()
    .int()
    .min(0)
    .max(PRODUCT_SLOTS - 1)
    .default(0),
  snapshot: z
    .object({
      mcat: z.string(),
      mcatId: z.string().default(""),
      contextJson: z.string(),
      products: ProductsSchema,
    })
    .nullable(),
  preferredId: z.string().nullable(),
  benchmarkNotes: z.string(),
});

export function serializeState(state: StudioState): string {
  return JSON.stringify({ version: STORAGE_VERSION, ...state });
}

export type LoadResult =
  | { status: "empty" }
  | { status: "loaded"; state: StudioState }
  | { status: "unreadable"; errors: string[] };

export function deserializeState(raw: string | null): LoadResult {
  if (raw === null) return { status: "empty" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: "unreadable", errors: ["Saved data is not valid JSON"] };
  }
  const result = StoredStateSchema.safeParse(parsed);
  if (!result.success) return { status: "unreadable", errors: formatIssues(result.error) };
  const d = result.data;
  return {
    status: "loaded",
    state: {
      mcat: d.mcat,
      mcatId: d.mcatId,
      contextJson: d.contextJson,
      products: normalizeProducts(d.products),
      device: d.device,
      fold: d.fold,
      viewports: d.viewports,
      previewProductIndex: d.previewProductIndex,
      snapshot: d.snapshot
        ? {
            mcat: d.snapshot.mcat,
            mcatId: d.snapshot.mcatId,
            contextJson: d.snapshot.contextJson,
            products: normalizeProducts(d.snapshot.products),
          }
        : null,
      preferredId: d.preferredId && isConceptId(d.preferredId) ? d.preferredId : null,
      benchmarkNotes: d.benchmarkNotes,
      aiDesign: d.aiDesign ? { ...d.aiDesign, concepts: d.aiDesign.concepts.map(toConcept) } : null,
    },
  };
}

// ---------------------------------------------------------------------------
// File import / export
// ---------------------------------------------------------------------------

const StudioFileSchema = z.object({
  app: z.literal(STUDIO_FILE_APP, {
    errorMap: () => ({ message: `must be "${STUDIO_FILE_APP}" — is this a PDP Studio export?` }),
  }),
  version: z.literal(1, { errorMap: () => ({ message: "unsupported file version" }) }),
  mcat: z.string(),
  /** Optional, so files exported before MCAT IDs existed still import. */
  mcatId: z.string().trim().default(""),
  context: z.unknown(),
  products: ProductsSchema,
  benchmarkNotes: z.string().default(""),
  preferredConceptId: z.string().nullable().default(null),
});

export type ExportResult = { ok: true; text: string } | { ok: false; error: string };

export function exportStudioFile(state: StudioState): ExportResult {
  let context: unknown;
  try {
    context = JSON.parse(state.contextJson);
  } catch {
    return { ok: false, error: "Fix the JSON context before exporting." };
  }
  const ctx = validatePdpContext(context);
  if (!ctx.ok) {
    return { ok: false, error: `Fix the JSON context before exporting: ${ctx.issues.join("; ")}` };
  }
  const file = {
    app: STUDIO_FILE_APP,
    version: 1,
    exportedAt: new Date().toISOString(),
    mcat: state.mcat,
    mcatId: state.mcatId,
    context,
    products: state.products.map(({ id: _id, ...rest }) => rest),
    benchmarkNotes: state.benchmarkNotes,
    preferredConceptId: state.preferredId,
  };
  return { ok: true, text: JSON.stringify(file, null, 2) };
}

export interface ImportedData {
  mcat: string;
  mcatId: string;
  contextJson: string;
  products: Product[];
  benchmarkNotes: string;
  preferredId: string | null;
  notes: string[];
}

export type ImportResult = { ok: true; data: ImportedData } | { ok: false; errors: string[] };

/**
 * Validate an import file completely before anything is applied. On failure the
 * caller must leave the current studio state untouched.
 */
export function importStudioFile(text: string): ImportResult {
  if (new Blob([text]).size > MAX_IMPORT_BYTES) {
    return { ok: false, errors: ["File is larger than 1 MB"] };
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
  const result = StudioFileSchema.safeParse(parsed);
  if (!result.success) return { ok: false, errors: formatIssues(result.error) };

  const file = result.data;
  const ctx = validatePdpContext(file.context);
  if (!ctx.ok) return { ok: false, errors: ctx.issues.map((issue) => `context: ${issue}`) };

  const notes: string[] = [];
  if (file.products.length < PRODUCT_SLOTS) {
    notes.push(`File has ${file.products.length} product(s); the remaining slots were left empty.`);
  }
  if (ctx.ignoredKeys.length > 0) {
    notes.push(`Context keys not used by the generator: ${ctx.ignoredKeys.join(", ")}`);
  }
  let preferredId = file.preferredConceptId;
  if (preferredId !== null && !conceptIds.includes(preferredId)) {
    notes.push(`Unknown preferred concept "${preferredId}" was ignored.`);
    preferredId = null;
  }

  return {
    ok: true,
    data: {
      mcat: file.mcat,
      mcatId: file.mcatId,
      contextJson: JSON.stringify(file.context, null, 2),
      products: normalizeProducts(file.products),
      benchmarkNotes: file.benchmarkNotes,
      preferredId,
      notes,
    },
  };
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export type StudioAction =
  | { type: "hydrate"; state: StudioState }
  | { type: "reset" }
  | { type: "setMcat"; mcat: string }
  | { type: "setMcatId"; mcatId: string }
  | { type: "setContextJson"; contextJson: string }
  | { type: "updateProduct"; id: string; patch: Partial<Product> }
  | { type: "setDevice"; device: DeviceMode }
  | { type: "setFold"; fold: FoldMode }
  | { type: "setViewport"; device: DeviceMode; viewport: Viewport }
  | { type: "setPreviewProduct"; index: number }
  | { type: "generate" }
  | { type: "setPreferred"; id: string | null }
  | { type: "setBenchmarkNotes"; notes: string }
  | { type: "setAiDesign"; design: AiDesign | null }
  | { type: "applyImport"; data: ImportedData };

export function studioReducer(state: StudioState, action: StudioAction): StudioState {
  switch (action.type) {
    case "hydrate":
      return action.state;
    case "reset":
      return createDefaultState();
    case "setMcat":
      return { ...state, mcat: action.mcat };
    case "setMcatId":
      return { ...state, mcatId: action.mcatId };
    case "setContextJson":
      return { ...state, contextJson: action.contextJson };
    case "updateProduct":
      return {
        ...state,
        products: state.products.map((p) =>
          p.id === action.id ? { ...p, ...action.patch, id: p.id } : p,
        ),
      };
    case "setDevice":
      return { ...state, device: action.device };
    case "setFold":
      return { ...state, fold: action.fold };
    case "setViewport":
      return { ...state, viewports: { ...state.viewports, [action.device]: action.viewport } };
    case "setPreviewProduct":
      return {
        ...state,
        previewProductIndex: Math.min(Math.max(0, action.index), PRODUCT_SLOTS - 1),
      };
    case "generate":
      return {
        ...state,
        snapshot: {
          mcat: state.mcat.trim(),
          mcatId: state.mcatId.trim(),
          contextJson: state.contextJson,
          products: state.products.map((p) => ({ ...p, imageUrls: [...p.imageUrls] })),
        },
        preferredId: null,
        // New inputs: an earlier AI design no longer applies.
        aiDesign: null,
      };
    case "setPreferred":
      return { ...state, preferredId: action.id };
    case "setBenchmarkNotes":
      return { ...state, benchmarkNotes: action.notes };
    case "setAiDesign":
      return { ...state, aiDesign: action.design, preferredId: null };
    case "applyImport":
      return {
        ...state,
        aiDesign: null,
        mcat: action.data.mcat,
        mcatId: action.data.mcatId,
        contextJson: action.data.contextJson,
        products: action.data.products,
        benchmarkNotes: action.data.benchmarkNotes,
        preferredId: action.data.preferredId,
        previewProductIndex: 0,
        snapshot: {
          mcat: action.data.mcat.trim(),
          mcatId: action.data.mcatId,
          contextJson: action.data.contextJson,
          products: action.data.products,
        },
      };
  }
}

// ---------------------------------------------------------------------------
// Removing the old demo data
// ---------------------------------------------------------------------------

const DEMO_FIELDS = [
  "name",
  "price",
  "priceMax",
  "unit",
  "moq",
  "highlights",
  "specs",
  "description",
] as const;

function stripDemoProduct(product: Product, index: number): Product {
  const demo = DEMO_PRODUCTS[index];
  if (!demo) return product;
  const cleaned = { ...product };
  for (const field of DEMO_FIELDS) {
    if (cleaned[field] === demo[field]) cleaned[field] = "";
  }
  return cleaned;
}

/**
 * Earlier versions started every brief with water-bottle demo data. Remove any value
 * that is still exactly the demo value (in the same slot); anything the user typed or
 * changed is kept.
 */
export function stripDemoData(state: StudioState): StudioState {
  const mcat = state.mcat === DEFAULT_MCAT ? "" : state.mcat;
  const contextJson =
    state.contextJson.trim() === DEFAULT_CONTEXT_JSON.trim()
      ? EMPTY_CONTEXT_JSON
      : state.contextJson;
  return {
    ...state,
    mcat,
    contextJson,
    products: state.products.map(stripDemoProduct),
    snapshot: state.snapshot
      ? {
          ...state.snapshot,
          mcat: state.snapshot.mcat === DEFAULT_MCAT ? "" : state.snapshot.mcat,
          contextJson:
            state.snapshot.contextJson.trim() === DEFAULT_CONTEXT_JSON.trim()
              ? EMPTY_CONTEXT_JSON
              : state.snapshot.contextJson,
          products: state.snapshot.products.map(stripDemoProduct),
        }
      : null,
  };
}
