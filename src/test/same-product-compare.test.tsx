import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { PdpStudio } from "@/components/pdp/studio";
import { CONCEPTS } from "@/lib/pdp/concepts";

const NAMES = ["TV One", "TV Two", "TV Three", "TV Four", "TV Five"];

function previewTitles() {
  return CONCEPTS.map((concept) => {
    const frame = screen.getByRole("region", { name: new RegExp(`^${concept.name} preview`) });
    return within(frame).getByRole("heading", { level: 4 }).textContent;
  });
}

function fillNamesAndGenerate() {
  NAMES.forEach((name, i) =>
    fireEvent.change(screen.getByLabelText(`Brief product ${i + 1} name`), {
      target: { value: name },
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Generate 5 Concepts" }));
}

describe("Fair comparison", () => {
  beforeEach(() => window.localStorage.clear());

  it("all five concepts preview the same product, defaulting to product 1", () => {
    render(<PdpStudio />);
    fillNamesAndGenerate();
    expect(previewTitles()).toEqual(Array(5).fill(NAMES[0]));
  });

  it("switching the preview product updates every concept together", () => {
    render(<PdpStudio />);
    fillNamesAndGenerate();
    fireEvent.click(screen.getByRole("radio", { name: /Product 3/ }));
    expect(screen.getByRole("radio", { name: /Product 3/ })).toBeChecked();
    expect(previewTitles()).toEqual(Array(5).fill(NAMES[2]));
  });
});
