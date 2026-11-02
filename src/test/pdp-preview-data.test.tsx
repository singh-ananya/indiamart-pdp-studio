import { render, screen, within } from "@testing-library/react";
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
    expect(screen.getByText("No image provided")).toBeInTheDocument();
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
    // Labels follow the IndiaMART Msite design guide.
    expect(screen.getByText("GST Verified")).toBeInTheDocument();
    expect(screen.getAllByText("Response Rate: 82%").length).toBeGreaterThan(0);
    expect(screen.queryByText("✓ Verified Supplier")).not.toBeInTheDocument();
    expect(screen.getByText("₹349 – ₹420")).toBeInTheDocument();
    expect(screen.getByText("/ piece")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Steel flask" })).toHaveAttribute(
      "src",
      "https://example.com/a.jpg",
    );
  });

  it("shows the Get Best Price CTA once in the page, not duplicated in the price block", () => {
    renderPreview({ ...EMPTY_PRODUCT, name: "x", price: "10" }, "{}");
    // The page itself has it once; the sticky action bar repeats it by design.
    const page = screen.getByRole("region", { name: /preview/ });
    expect(within(page).getAllByText("Get Best Price")).toHaveLength(1);
    expect(screen.getByLabelText("Sticky action bar")).toHaveTextContent("Get Best Price");
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
