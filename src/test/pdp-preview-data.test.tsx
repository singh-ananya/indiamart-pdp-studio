import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConceptPreview } from "@/components/pdp/concept-preview";
import { EMPTY_PRODUCT } from "@/lib/pdp/demo-data";
import { parsePdpContext } from "@/lib/pdp/schema";
import { buildSpecRows, formatPrice } from "@/lib/pdp/specs";
import type { Concept, Product } from "@/lib/pdp/types";

const ALL_BLOCKS: Concept = {
  id: "all",
  name: "All blocks",
  tagline: "",
  bestFor: "",
  firstFold: ["gallery", "title", "price", "cta", "ratings", "offer"],
  below: ["highlights", "specs", "description", "trust", "seller"],
};

function renderPreview(product: Product, contextJson: string) {
  return render(
    <ConceptPreview
      concept={ALL_BLOCKS}
      product={product}
      ctx={parsePdpContext(contextJson)}
      mcat="Test MCAT"
      device="mobile"
      fold="full"
    />,
  );
}

describe("Preview shows only supplied data", () => {
  it("shows not-provided slots instead of invented ratings, tenure or trust badges", () => {
    renderPreview({ ...EMPTY_PRODUCT, name: "Bare product" }, "{}");
    expect(screen.getByText(/Seller rating not provided/)).toBeInTheDocument();
    expect(screen.getByText(/No trust signals provided/)).toBeInTheDocument();
    expect(screen.getByText("Price not provided")).toBeInTheDocument();
    expect(screen.getByText("No image URL provided")).toBeInTheDocument();
    expect(screen.queryByText(/Member since/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\(demo/)).not.toBeInTheDocument();
  });

  it("renders supplied seller signals, price range, unit and images", () => {
    renderPreview(
      {
        ...EMPTY_PRODUCT,
        name: "Steel flask",
        price: "349",
        priceMax: "420",
        unit: "piece",
        imageUrls: ["https://example.com/a.jpg"],
      },
      JSON.stringify({
        sellerRating: 4.2,
        ratingCount: 31,
        memberSince: 2017,
        gstVerified: true,
        responseRate: 82,
      }),
    );
    expect(screen.getByText("4.2 / 5 (31 ratings)")).toBeInTheDocument();
    expect(screen.getByText(/Member since 2017/)).toBeInTheDocument();
    expect(screen.getByText("GST verified")).toBeInTheDocument();
    expect(screen.getByText("82% response rate")).toBeInTheDocument();
    expect(screen.queryByText("Verified supplier")).not.toBeInTheDocument();
    expect(screen.getByText("₹349 – ₹420")).toBeInTheDocument();
    expect(screen.getByText("/ piece")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Steel flask" })).toHaveAttribute(
      "src",
      "https://example.com/a.jpg",
    );
  });

  it("shows the Get Best Price CTA once, not duplicated in the price block", () => {
    renderPreview({ ...EMPTY_PRODUCT, name: "x", price: "10" }, "{}");
    expect(screen.getAllByText("Get Best Price")).toHaveLength(1);
  });
});

describe("Spec rows", () => {
  it("orders by ISQ priority and flags missing ISQ values without filling them", () => {
    const rows = buildSpecRows("Finish: Matte\ncapacity: 1 L", ["Material", "Capacity"]);
    expect(rows).toEqual([
      { name: "Material", value: "", isIsq: true, missing: true },
      { name: "capacity", value: "1 L", isIsq: true, missing: false },
      { name: "Finish", value: "Matte", isIsq: false, missing: false },
    ]);
  });

  it("formats single prices and ranges", () => {
    expect(formatPrice("349", "")).toBe("₹349");
    expect(formatPrice("349", "420")).toBe("₹349 – ₹420");
    expect(formatPrice("", "")).toBe("");
  });
});
