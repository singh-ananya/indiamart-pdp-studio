import { describe, expect, it } from "vitest";
import {
  createDefaultState,
  deserializeState,
  exportStudioFile,
  importStudioFile,
  serializeState,
  studioReducer,
} from "@/lib/pdp/studio-state";

const validFile = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    app: "indiamart-pdp-studio",
    version: 1,
    mcat: "Steel Pipes",
    context: { brand: "Acme", sellerRating: 4.1 },
    products: [{ name: "MS Pipe", price: 120, unit: "kg" }],
    ...overrides,
  });

describe("storage round trip", () => {
  it("restores every persisted field", () => {
    let state = createDefaultState();
    state = studioReducer(state, { type: "setMcat", mcat: "Saved MCAT" });
    state = studioReducer(state, { type: "setBenchmarkNotes", notes: "note" });
    state = studioReducer(state, { type: "setFold", fold: "full" });
    state = studioReducer(state, { type: "generate" });
    state = studioReducer(state, { type: "setPreferred", id: "spec-first" });

    const loaded = deserializeState(serializeState(state));
    expect(loaded).toEqual({ status: "loaded", state });
  });

  it("loads version 1 saves from before MCAT IDs existed", () => {
    const state = studioReducer(createDefaultState(), { type: "generate" });
    const { mcatId: _id, snapshot, ...rest } = state;
    const { mcatId: _snapId, ...v1Snapshot } = snapshot!;
    const v1 = JSON.stringify({ ...rest, version: 1, snapshot: v1Snapshot });

    const loaded = deserializeState(v1);
    expect(loaded.status).toBe("loaded");
    if (loaded.status !== "loaded") return;
    expect(loaded.state.mcatId).toBe("");
    expect(loaded.state.snapshot?.mcatId).toBe("");
    expect(loaded.state.mcat).toBe(state.mcat);
  });

  it("saves as version 2 and keeps the MCAT ID in the brief and snapshot", () => {
    let state = studioReducer(createDefaultState(), { type: "setMcatId", mcatId: " 42 " });
    state = studioReducer(state, { type: "generate" });
    expect(state.snapshot?.mcatId).toBe("42");
    const raw = serializeState(state);
    expect(JSON.parse(raw)).toMatchObject({ version: 2, mcatId: " 42 " });
    expect(deserializeState(raw)).toEqual({ status: "loaded", state });
  });

  it("reports empty and unreadable storage instead of throwing", () => {
    expect(deserializeState(null)).toEqual({ status: "empty" });
    expect(deserializeState("{oops").status).toBe("unreadable");
    expect(deserializeState(JSON.stringify({ version: 99 })).status).toBe("unreadable");
  });
});

describe("export", () => {
  it("exports a file that imports back to the same brief", () => {
    const state = createDefaultState();
    const exported = exportStudioFile(state);
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    const imported = importStudioFile(exported.text);
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.data.mcat).toBe(state.mcat);
    expect(imported.data.products).toEqual(state.products);
    expect(JSON.parse(imported.data.contextJson)).toEqual(JSON.parse(state.contextJson));
  });

  it("carries the MCAT ID through export and import", () => {
    const state = studioReducer(createDefaultState(), { type: "setMcatId", mcatId: "137347" });
    const exported = exportStudioFile(state);
    if (!exported.ok) throw new Error(exported.error);
    const imported = importStudioFile(exported.text);
    if (!imported.ok) throw new Error(imported.errors.join("; "));
    expect(imported.data.mcatId).toBe("137347");
  });

  it("imports files exported before MCAT IDs existed", () => {
    const imported = importStudioFile(validFile());
    if (!imported.ok) throw new Error(imported.errors.join("; "));
    expect(imported.data.mcatId).toBe("");
  });

  it("refuses to export while the context is invalid", () => {
    const state = { ...createDefaultState(), contextJson: "{ broken" };
    expect(exportStudioFile(state).ok).toBe(false);
  });
});

describe("import validation", () => {
  it("accepts a valid file and pads products to five empty slots", () => {
    const result = importStudioFile(validFile());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.products).toHaveLength(5);
    expect(result.data.products[0]).toMatchObject({ id: "p1", name: "MS Pipe", price: "120" });
    expect(result.data.products[4]).toMatchObject({ id: "p5", name: "", price: "" });
    expect(result.data.notes.join(" ")).toMatch(/1 product/);
  });

  it.each([
    ["not JSON", "{nope"],
    ["wrong app", validFile({ app: "something-else" })],
    ["wrong version", validFile({ version: 2 })],
    ["invalid context field", validFile({ context: { sellerRating: 9 } })],
    ["context is not an object", validFile({ context: [1] })],
    ["too many products", validFile({ products: Array(6).fill({ name: "x" }) })],
    ["no products", validFile({ products: [] })],
    ["bad image URL", validFile({ products: [{ imageUrls: ["file:///etc/passwd"] }] })],
  ])("rejects %s with a readable error", (_label, text) => {
    const result = importStudioFile(text);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("ignores an unknown preferred concept rather than failing", () => {
    const result = importStudioFile(validFile({ preferredConceptId: "made-up" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.preferredId).toBeNull();
  });
});
