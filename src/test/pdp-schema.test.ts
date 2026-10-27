import { describe, expect, it } from "vitest";
import { DEFAULT_CONTEXT_JSON } from "@/lib/pdp/demo-data";
import {
  ProductInputSchema,
  parseImageUrlText,
  parsePdpContext,
  toProduct,
} from "@/lib/pdp/schema";

describe("PDP context schema", () => {
  it("accepts every optional IndiaMART field with valid values", () => {
    const ctx = parsePdpContext(
      JSON.stringify({
        brand: "Acme",
        isqAttributes: ["Material", "Capacity"],
        sellerRating: 4.2,
        ratingCount: 31,
        memberSince: 2017,
        gstVerified: true,
        verifiedSupplier: false,
        responseRate: 82,
      }),
    );
    expect(ctx.ok).toBe(true);
    expect(ctx.isqAttributes).toEqual(["Material", "Capacity"]);
    expect(ctx.sellerRating).toBe(4.2);
    expect(ctx.ratingCount).toBe(31);
    expect(ctx.memberSince).toBe("2017");
    expect(ctx.gstVerified).toBe(true);
    expect(ctx.verifiedSupplier).toBe(false);
    expect(ctx.responseRate).toBe(82);
  });

  it("leaves seller signals undefined when they are not provided (no defaults invented)", () => {
    const ctx = parsePdpContext(DEFAULT_CONTEXT_JSON);
    expect(ctx.ok).toBe(true);
    expect(ctx.sellerRating).toBeUndefined();
    expect(ctx.ratingCount).toBeUndefined();
    expect(ctx.memberSince).toBeUndefined();
    expect(ctx.gstVerified).toBeUndefined();
    expect(ctx.verifiedSupplier).toBeUndefined();
    expect(ctx.responseRate).toBeUndefined();
    expect(ctx.isqAttributes).toEqual([]);
  });

  it("reports every out-of-range or wrongly typed field by path", () => {
    const ctx = parsePdpContext(
      JSON.stringify({ sellerRating: 7, responseRate: "90%", memberSince: "17" }),
    );
    expect(ctx.ok).toBe(false);
    expect(ctx.issues.some((i) => i.startsWith("sellerRating:"))).toBe(true);
    expect(ctx.issues.some((i) => i.startsWith("responseRate:"))).toBe(true);
    expect(ctx.issues.some((i) => i.startsWith("memberSince:"))).toBe(true);
  });

  it("rejects a future member-since year", () => {
    const ctx = parsePdpContext(JSON.stringify({ memberSince: new Date().getFullYear() + 1 }));
    expect(ctx.ok).toBe(false);
  });

  it("lists unknown keys as ignored instead of claiming they were used", () => {
    const ctx = parsePdpContext(JSON.stringify({ brand: "Acme", tagline: "x" }));
    expect(ctx.ok).toBe(true);
    expect(ctx.ignoredKeys).toEqual(["tagline"]);
  });

  it("rejects non-object JSON", () => {
    expect(parsePdpContext("[1,2]").ok).toBe(false);
    expect(parsePdpContext("null").ok).toBe(false);
  });
});

describe("Product input schema", () => {
  it("fills missing optional fields with empty values, not invented ones", () => {
    const product = toProduct(ProductInputSchema.parse({ name: "Only a name" }), 0);
    expect(product).toMatchObject({
      id: "p1",
      name: "Only a name",
      price: "",
      priceMax: "",
      unit: "",
      imageUrls: [],
    });
  });

  it("merges structured ISQ values into spec lines", () => {
    const product = toProduct(
      ProductInputSchema.parse({
        specs: "Material: Steel",
        isq: [{ name: "Capacity", value: 750 }],
      }),
      2,
    );
    expect(product.id).toBe("p3");
    expect(product.specs).toBe("Material: Steel\nCapacity: 750");
  });

  it("rejects non-http image URLs", () => {
    expect(ProductInputSchema.safeParse({ imageUrls: ["javascript:alert(1)"] }).success).toBe(
      false,
    );
    expect(ProductInputSchema.safeParse({ imageUrls: ["https://example.com/a.jpg"] }).success).toBe(
      true,
    );
  });

  it("splits image URL editor text into valid and invalid lines", () => {
    expect(parseImageUrlText("https://a.example/1.jpg\n\nnot a url\nftp://x/y")).toEqual({
      urls: ["https://a.example/1.jpg"],
      invalid: ["not a url", "ftp://x/y"],
    });
  });
});
