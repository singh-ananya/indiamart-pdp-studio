import { describe, expect, it } from "vitest";
import { CONCEPTS } from "@/lib/pdp/concepts";
import { DEFAULT_CONTEXT_JSON, DEMO_PRODUCTS, parsePdpContext } from "@/lib/pdp/demo-data";

describe("PDP concept generator", () => {
  it("always produces exactly five distinct concepts", () => {
    expect(CONCEPTS).toHaveLength(5);
    expect(new Set(CONCEPTS.map((c) => c.id)).size).toBe(5);
  });

  it("every concept has first-fold and below-fold blocks for both fold views", () => {
    for (const concept of CONCEPTS) {
      expect(concept.firstFold.length).toBeGreaterThan(0);
      expect(concept.below.length).toBeGreaterThan(0);
    }
  });
});

describe("JSON context parsing", () => {
  it("parses the demo context fields", () => {
    const ctx = parsePdpContext(DEFAULT_CONTEXT_JSON);
    expect(ctx.ok).toBe(true);
    expect(ctx.brand).toContain("(demo)");
    expect(ctx.usps.length).toBeGreaterThan(0);
  });

  it("reports invalid JSON instead of throwing", () => {
    const ctx = parsePdpContext("{ not json");
    expect(ctx.ok).toBe(false);
    expect(ctx.error).toBeTruthy();
  });
});

describe("demo data policy", () => {
  it("ships exactly five demo product cards, all labeled demo", () => {
    expect(DEMO_PRODUCTS).toHaveLength(5);
    for (const product of DEMO_PRODUCTS) {
      expect(product.name).toContain("(demo)");
    }
  });
});
