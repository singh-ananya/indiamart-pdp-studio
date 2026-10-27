import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConceptPreview } from "@/components/pdp/concept-preview";
import { CONCEPTS } from "@/lib/pdp/concepts";
import { DEMO_PRODUCTS } from "@/lib/pdp/demo-data";
import {
  buildFoldReport,
  classifyBlock,
  fitScale,
  matchPreset,
  presetsFor,
} from "@/lib/pdp/devices";
import { parsePdpContext } from "@/lib/pdp/schema";
import type { FoldMode } from "@/lib/pdp/types";

describe("fold classification", () => {
  it("classifies blocks against the fold height", () => {
    expect(classifyBlock(0, 640, 640)).toBe("above");
    expect(classifyBlock(600, 680, 640)).toBe("cut");
    expect(classifyBlock(640, 700, 640)).toBe("below");
  });

  it("ignores sub-pixel overflow of up to 1px", () => {
    expect(classifyBlock(582.5, 640.5, 640)).toBe("above");
    expect(classifyBlock(582.5, 641.5, 640)).toBe("cut");
  });

  it("reports planned first-fold blocks that do not fully fit", () => {
    const report = buildFoldReport(
      [
        { kind: "gallery", top: 48, bottom: 420 },
        { kind: "title", top: 432, bottom: 480 },
        { kind: "price", top: 600, bottom: 660 },
        { kind: "cta", top: 672, bottom: 716 },
      ],
      640,
      ["gallery", "title", "price", "cta"],
    );
    expect(report.above).toEqual(["gallery", "title"]);
    expect(report.cut).toEqual(["price"]);
    expect(report.below).toEqual(["cta"]);
    expect(report.missedIntent).toEqual(["price", "cta"]);
  });
});

describe("frame scaling and presets", () => {
  it("scales down to fit but never enlarges", () => {
    expect(fitScale(300, 360)).toBeCloseTo(0.8333, 3);
    expect(fitScale(800, 360)).toBe(1);
    expect(fitScale(0, 360)).toBe(1);
  });

  it("matches presets per device", () => {
    expect(presetsFor("mobile").every((p) => p.device === "mobile")).toBe(true);
    expect(matchPreset("mobile", { width: 390, height: 844 })?.label).toBe("iPhone 12–15");
    expect(matchPreset("mobile", { width: 390, height: 700 })).toBeUndefined();
  });
});

describe("device frame", () => {
  const renderMode = (fold: FoldMode) =>
    render(
      <ConceptPreview
        concept={CONCEPTS[0]!}
        product={DEMO_PRODUCTS[0]!}
        ctx={parsePdpContext("{}")}
        mcat="Test"
        device="mobile"
        fold={fold}
        viewport={{ width: 390, height: 844 }}
      />,
    );

  it("renders the frame at the exact viewport size", () => {
    renderMode("first");
    const frame = screen.getByRole("region", { name: /390 by 844/ });
    expect(frame).toHaveStyle({ width: "390px", height: "844px" });
  });

  it("first fold clips at the frame edge and does not scroll", () => {
    renderMode("first");
    const frame = screen.getByRole("region", { name: /390 by 844/ });
    expect(frame.className).toContain("overflow-hidden");
    expect(screen.queryByText("Fold 844px")).not.toBeInTheDocument();
  });

  it("full PDP scrolls inside the frame and marks the fold at the viewport height", () => {
    renderMode("full");
    const frame = screen.getByRole("region", { name: /390 by 844/ });
    expect(frame.className).toContain("overflow-y-auto");
    const marker = screen.getByText("Fold 844px").parentElement!;
    expect(marker).toHaveStyle({ top: "844px" });
  });

  it("renders every block of the concept in both modes so clipping, not filtering, decides visibility", () => {
    const { container } = renderMode("first");
    const kinds = [...container.querySelectorAll("[data-block]")].map(
      (el) => (el as HTMLElement).dataset["block"],
    );
    expect(kinds).toEqual([...CONCEPTS[0]!.firstFold, ...CONCEPTS[0]!.below]);
  });
});
