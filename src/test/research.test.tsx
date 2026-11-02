import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { PdpStudio } from "@/components/pdp/studio";
import {
  buildQueries,
  candidatesFrom,
  quoteIsOnPage,
  runBenchmarkResearch,
  verifyAnalysis,
} from "@/lib/ai/research";
import { parseBenchmarkText } from "@/lib/pdp/benchmark";
import { createMemoryBenchmarkRemote } from "@/lib/pdp/benchmark-store";
import { sha256Hex } from "@/lib/pdp/mcat-config";
import { createMemoryCache, createMemoryRemote } from "@/lib/pdp/mcat-config-store";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const PAGES = {
  "https://b2b.example/led-tv-32": {
    title: "32 inch LED TV - wholesale",
    content:
      "32 Inch LED TV. Minimum Order Quantity: 50 Pieces. Screen Size: 32 inch. Resolution: 1366 x 768. GST Verified supplier.",
  },
  "https://shop.example/tv/32-hd": {
    title: "Buy 32 inch HD TV",
    content:
      "Key features: Dolby Audio, 2 HDMI ports. Bank offer: 10% instant discount. Specifications Display: LED.",
  },
  "https://shop.example/search?q=tv": {
    title: "Search results",
    content: "Showing 1-24 of 400 TVs",
  },
  "https://blank.example/p/1": { title: "No text", content: "" },
  "https://m.indiamart.com/proddetail/x.html": {
    title: "IndiaMART",
    content: "should never be used",
  },
};

/** Fake OpenRouter: web-search calls return annotations; analysis calls answer per page. */
function fakeOpenRouter() {
  const requests: Record<string, unknown>[] = [];
  const fetchImpl = (async (_url: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    requests.push(body);
    if (Array.isArray(body["plugins"])) {
      return json({
        choices: [
          {
            message: {
              // The model's text even mentions a URL the search never returned; it must be ignored.
              content: "See also https://invented.example/fake",
              annotations: Object.entries(PAGES).map(([url, page]) => ({
                type: "url_citation",
                url_citation: { url, title: page.title, content: page.content },
              })),
            },
          },
        ],
        usage: { cost: 0.01 },
      });
    }
    const prompt = String((body["messages"] as { content: string }[])[0]!.content);
    const analysis = prompt.includes("b2b.example")
      ? {
          isProductPage: true,
          type: "b2b",
          observations: [
            {
              pattern: "moq-or-bulk-pricing",
              note: "MOQ shown",
              evidence: "Minimum Order Quantity: 50 Pieces",
            },
            { pattern: "spec-table", note: "Spec rows", evidence: "Screen Size: 32 inch" },
            {
              pattern: "trust-badges",
              note: "Invented badge",
              evidence: "TrustSEAL Verified Since 2010",
            },
            { pattern: "price-above-fold", note: "Layout claim", evidence: "32 Inch LED TV" },
          ],
          strengths: ["MOQ is explicit"],
          applicability: "Show MOQ beside the price.",
        }
      : prompt.includes("shop.example/tv")
        ? {
            isProductPage: true,
            type: "ecommerce",
            observations: [
              {
                pattern: "offer-banner",
                note: "Bank offer",
                evidence: "Bank offer: 10% instant discount",
              },
              {
                pattern: "key-highlights",
                note: "Feature list",
                evidence: "Key features: Dolby Audio",
              },
            ],
            strengths: [],
            applicability: "Surface offers near the price.",
          }
        : { isProductPage: false };
    return json({
      choices: [{ message: { content: JSON.stringify(analysis) } }],
      usage: { cost: 0.001 },
    });
  }) as typeof fetch;
  return { fetchImpl, requests };
}

const settings = {
  baseUrl: "https://openrouter.ai/api/v1",
  model: "qwen/qwen3.8-flash",
  apiKey: "sk-or-v1-test",
};
const input = {
  mcatName: "32 inch LED TV",
  mcatId: "650708",
  productNames: ["Sony Bravia 32", "LG 32LQ570"],
};

describe("research helpers", () => {
  it("builds queries only from the user's inputs", () => {
    const queries = buildQueries(input);
    expect(queries).toHaveLength(3);
    expect(queries.every((q) => q.includes("32 inch LED TV"))).toBe(true);
    expect(queries[2]).toContain("Sony Bravia 32, LG 32LQ570");
  });

  it("takes candidates only from search citations, never IndiaMART", () => {
    const candidates = candidatesFrom({
      choices: [
        {
          message: {
            annotations: [
              {
                type: "url_citation",
                url_citation: { url: "https://a.example/p", title: "A", content: "x" },
              },
              {
                type: "url_citation",
                url_citation: { url: "https://a.example/p#reviews", title: "A", content: "x" },
              },
              {
                type: "url_citation",
                url_citation: { url: "https://dir.indiamart.com/impcat/tv.html" },
              },
              { type: "other" },
            ],
          },
        },
      ],
    });
    expect(candidates.map((c) => c.url)).toEqual(["https://a.example/p"]);
  });

  it("checks quotes case- and whitespace-insensitively, and refuses tiny quotes", () => {
    expect(quoteIsOnPage("minimum  order quantity", "Minimum Order Quantity: 50")).toBe(true);
    expect(quoteIsOnPage("TrustSEAL", "Minimum Order Quantity: 50")).toBe(false);
    expect(quoteIsOnPage("50", "Minimum Order Quantity: 50")).toBe(false);
  });

  it("marks a page as not inspected when none of its quotes are real", () => {
    const verdict = verifyAnalysis(
      {
        isProductPage: true,
        type: "b2b",
        observations: [{ pattern: "spec-table", note: "n", evidence: "made up words here" }],
      },
      { url: "https://x.example/p", title: "", content: "real page text" },
    );
    expect(verdict).toMatchObject({
      kind: "entry",
      dropped: 1,
      entry: {
        status: "not-inspected",
        reason: expect.stringMatching(/None of the AI's quoted evidence/),
      },
    });
  });
});

describe("runBenchmarkResearch", () => {
  it("keeps only verified, layout-free observations and produces a valid benchmark file", async () => {
    const { fetchImpl, requests } = fakeOpenRouter();
    const progress: string[] = [];
    const result = await runBenchmarkResearch({
      provider: "openrouter",
      settings,
      input,
      fetchImpl,
      onProgress: (p) => progress.push(p.stage),
    });

    const parsed = parseBenchmarkText(JSON.stringify(result.file));
    if (!parsed.ok) throw new Error(parsed.errors.join("; "));
    const entries = parsed.file.entries;
    expect(entries.map((e) => e.url)).toEqual([
      "https://b2b.example/led-tv-32",
      "https://shop.example/tv/32-hd",
      "https://blank.example/p/1",
    ]);
    const b2b = entries[0]!;
    if (b2b.status !== "inspected") throw new Error("expected inspected");
    expect(b2b.site).toBe("b2b.example");
    expect(b2b.observations.map((o) => o.pattern)).toEqual(["moq-or-bulk-pricing", "spec-table"]);
    expect(entries[2]).toMatchObject({ status: "not-inspected", type: "unknown" });
    // Invented badge and the layout claim were dropped.
    expect(result.droppedObservations).toBe(2);
    expect(parsed.file.method).toMatch(/word-for-word/);
    // 3 searches at $0.01 + 3 analyses at $0.001 (blank page is not analysed).
    expect(result.cost).toBeCloseTo(0.033, 6);
    expect(progress).toContain("searching");
    expect(progress.at(-1)).toBe("finished");

    const search = requests.find((r) => Array.isArray(r["plugins"]))!;
    expect(search["plugins"]).toEqual([
      {
        id: "web",
        engine: "exa",
        max_results: 10,
        exclude_domains: ["indiamart.com", "*.indiamart.com"],
      },
    ]);
    expect(JSON.stringify(result.file)).not.toContain("invented.example");
    expect(JSON.stringify(result.file)).not.toContain("indiamart.com/proddetail");
  });

  it("refuses to run without OpenRouter, a key or an MCAT name", async () => {
    const { fetchImpl } = fakeOpenRouter();
    await expect(
      runBenchmarkResearch({ provider: "groq", settings, input, fetchImpl }),
    ).rejects.toThrow(/needs OpenRouter/);
    await expect(
      runBenchmarkResearch({
        provider: "openrouter",
        settings: { ...settings, apiKey: "" },
        input,
        fetchImpl,
      }),
    ).rejects.toThrow(/Enter your OpenRouter key/);
    await expect(
      runBenchmarkResearch({
        provider: "openrouter",
        settings,
        input: { ...input, mcatName: " " },
        fetchImpl,
      }),
    ).rejects.toThrow(/MCAT name/);
  });
});

describe("Run benchmark research button", () => {
  beforeEach(() => window.localStorage.clear());

  it("researches, saves to Saved research and reports what was dropped and spent", async () => {
    const USER = "tester@indiamart.com";
    const mcatText = JSON.stringify({
      version: "v1",
      mcats: {
        "650708": {
          importance_ranking: [{ Dimension: "image", Level: "High", Rank: "1", Show: "Yes" }],
        },
      },
    });
    const bytes = new TextEncoder().encode(mcatText);
    const benchmarkRemote = createMemoryBenchmarkRemote();
    render(
      <PdpStudio
        aiFetch={fakeOpenRouter().fetchImpl}
        benchmarkRemote={benchmarkRemote}
        mcatStorage={{
          remote: createMemoryRemote({
            email: USER,
            files: [
              {
                bytes,
                sha256: await sha256Hex(bytes),
                version: {
                  version: "v1",
                  fileName: "m.json",
                  mcatCount: 1,
                  warnings: [],
                  uploadedBy: USER,
                  uploadedAt: "2026-11-01T00:00:00Z",
                },
              },
            ],
          }),
          cache: createMemoryCache(),
        }}
      />,
    );
    await screen.findByLabelText("Active MCAT configuration");
    fireEvent.change(screen.getByLabelText("MCAT name"), { target: { value: "32 inch LED TV" } });
    fireEvent.change(screen.getByLabelText("MCAT ID"), { target: { value: "650708" } });
    fireEvent.change(screen.getByLabelText("Brief product 1 name"), {
      target: { value: "Sony Bravia 32" },
    });

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Benchmark Comparison" }), {
      button: 0,
      ctrlKey: false,
    });
    const runner = screen.getByLabelText("Benchmark research");
    const button = within(runner).getByRole("button", { name: "Run benchmark research" });
    expect(button).toBeDisabled();
    expect(runner).toHaveTextContent("Enter your OpenRouter key in Your AI key.");

    fireEvent.change(screen.getByLabelText("OpenRouter key"), {
      target: { value: "sk-or-v1-test" },
    });
    await act(async () => {
      fireEvent.click(within(runner).getByRole("button", { name: "Run benchmark research" }));
    });

    expect(await within(runner).findByText("Research saved to Saved research")).toBeInTheDocument();
    expect(runner).toHaveTextContent("3 product pages: 2 inspected, 1 could not be inspected.");
    expect(runner).toHaveTextContent(
      "2 AI observation(s) dropped because their quote was not on the page.",
    );
    expect(runner).toHaveTextContent("Cost reported by OpenRouter: $0.0330.");
    expect(benchmarkRemote.rows).toHaveLength(1);
    expect(await screen.findByLabelText("Saved research")).toHaveTextContent(
      "32 inch LED TV (MCAT 650708)",
    );
    expect(screen.getByLabelText("Benchmark results")).toHaveTextContent("b2b.example");
  });
});
