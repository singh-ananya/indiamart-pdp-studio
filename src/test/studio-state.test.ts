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
