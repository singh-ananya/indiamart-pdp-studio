import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { BenchmarkedSites } from "@/components/pdp/benchmarked-sites";
import { PdpStudio } from "@/components/pdp/studio";
import { parseBenchmarkText } from "@/lib/pdp/benchmark";

function openTab(name: string) {
  const tab = screen.getByRole("tab", { name });
  fireEvent.mouseDown(tab, { button: 0, ctrlKey: false });
  expect(tab).toHaveAttribute("aria-selected", "true");
}

describe("Studio tabs", () => {
  beforeEach(() => window.localStorage.clear());

  it("has the design, MCAT, benchmark, sources and recommendation tabs only", () => {
    render(<PdpStudio />);
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "Five Concepts",
      "MCAT Ranking",
      "Benchmark Comparison",
      "Sources",
      "Final Recommendation",
    ]);
    expect(screen.queryByRole("tab", { name: "Product Cards" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "JSON Context" })).toBeNull();
    expect(screen.getByRole("button", { name: "Generate 5 AI Designs" })).toBeInTheDocument();
  });

  it("shows the MCAT ranking in its own tab", () => {
    render(<PdpStudio />);
    openTab("MCAT Ranking");
    expect(screen.getByText(/No MCAT ID set/)).toBeInTheDocument();
  });

  it("lists the benchmarked websites above the designs", () => {
    render(<PdpStudio />);
    fireEvent.change(screen.getByLabelText("Brief product 1 name"), { target: { value: "TV" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate 5 AI Designs" }));
    expect(screen.getByLabelText("Benchmarked websites")).toHaveTextContent(
      "No benchmark research for this MCAT yet",
    );
  });
});

describe("Benchmarked websites", () => {
  it("links every inspected page and counts the ones that could not be opened", () => {
    const parsed = parseBenchmarkText(
      JSON.stringify({
        app: "indiamart-pdp-studio-benchmark",
        version: 1,
        mcat: { name: "32 inch LED TV", id: "650708" },
        researchedAt: "2026-11-02",
        method: "test",
        entries: [
          {
            site: "tradeindia.com",
            type: "b2b",
            url: "https://www.tradeindia.com/products/tv-1.html",
            status: "inspected",
            inspectedAt: "2026-11-02",
            observations: [{ pattern: "spec-table", note: "n", evidence: "Screen Size 32" }],
            strengths: [],
            applicability: "a",
          },
          {
            site: "flipkart.com",
            type: "ecommerce",
            url: "https://www.flipkart.com/tv/p/1",
            status: "inspected",
            inspectedAt: "2026-11-02",
            observations: [{ pattern: "offer-banner", note: "n", evidence: "Bank offer 10%" }],
            strengths: [],
            applicability: "a",
          },
          {
            site: "croma.com",
            type: "unknown",
            url: "https://www.croma.com/tv/p/1",
            status: "not-inspected",
            reason: "HTTP 403",
          },
        ],
      }),
    );
    if (!parsed.ok) throw new Error(parsed.errors.join("; "));
    render(<BenchmarkedSites benchmark={parsed.file} />);
    const box = screen.getByLabelText("Benchmarked websites");
    expect(box).toHaveTextContent("Benchmarked against 2 product page(s) on other websites");
    expect(box).toHaveTextContent("1 more could not be opened");
    const links = within(box).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "https://www.tradeindia.com/products/tv-1.html",
      "https://www.flipkart.com/tv/p/1",
    ]);
    expect(links[0]).toHaveTextContent("tradeindia.com · B2B");
    expect(within(box).queryByText(/croma/)).toBeNull();
  });
});
