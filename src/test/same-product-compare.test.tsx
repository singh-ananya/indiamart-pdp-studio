import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { PdpStudio } from "@/components/pdp/studio";
import { CONCEPTS } from "@/lib/pdp/concepts";
import { DEMO_PRODUCTS } from "@/lib/pdp/demo-data";

function previewTitles() {
  return CONCEPTS.map((concept) => {
    const frame = screen.getByRole("region", { name: new RegExp(`^${concept.name} preview`) });
    return within(frame).getByRole("heading", { level: 4 }).textContent;
  });
}

describe("Fair comparison", () => {
  beforeEach(() => window.localStorage.clear());

  it("all five concepts preview the same product, defaulting to product 1", () => {
    render(<PdpStudio />);
    fireEvent.click(screen.getByRole("button", { name: "Generate 5 Concepts" }));
    expect(previewTitles()).toEqual(Array(5).fill(DEMO_PRODUCTS[0]!.name));
  });

  it("switching the preview product updates every concept together", () => {
    render(<PdpStudio />);
    fireEvent.click(screen.getByRole("button", { name: "Generate 5 Concepts" }));
    fireEvent.click(screen.getByRole("radio", { name: /Product 3/ }));
    expect(screen.getByRole("radio", { name: /Product 3/ })).toBeChecked();
    expect(previewTitles()).toEqual(Array(5).fill(DEMO_PRODUCTS[2]!.name));
  });
});
