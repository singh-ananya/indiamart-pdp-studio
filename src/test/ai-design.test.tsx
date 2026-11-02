import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { PdpStudio } from "@/components/pdp/studio";
import {
  availableIsqNames,
  buildDesignBrief,
  designConcepts,
  parseDesignAnswer,
  validateDesign,
} from "@/lib/ai/design";
import { parseBenchmarkText } from "@/lib/pdp/benchmark";
import { ALL_BLOCKS } from "@/lib/pdp/concepts";
import { EMPTY_PRODUCT } from "@/lib/pdp/demo-data";
import { parsePdpContext } from "@/lib/pdp/schema";
import {
  createDefaultState,
  deserializeState,
  serializeState,
  studioReducer,
} from "@/lib/pdp/studio-state";
import type { Product } from "@/lib/pdp/types";

const TV: Product = {
  ...EMPTY_PRODUCT,
  id: "p1",
  name: "32 Inch LED TV",
  price: "7800",
  unit: "Piece",
  specs: "Screen Size: 32 inch\nResolution: 1366 x 768\nWarranty: 1 year",
  imageUrls: ["https://5.imimg.com/tv-500x500.jpeg"],
};

const benchmark = (() => {
  const r = parseBenchmarkText(
    JSON.stringify({
      app: "indiamart-pdp-studio-benchmark",
      version: 1,
      mcat: { name: "32 inch LED TV", id: "650708" },
      researchedAt: "2026-11-02",
      method: "test",
      entries: [
        {
          site: "shop.example",
          type: "ecommerce",
          url: "https://shop.example/tv",
          status: "inspected",
          inspectedAt: "2026-11-02",
          observations: [
            { pattern: "spec-table", note: "Spec table", evidence: "Screen Size 32 inch" },
          ],
          strengths: ["Clear specs"],
          applicability: "Show key specs early.",
        },
        {
          site: "b2b.example",
          type: "b2b",
          url: "https://b2b.example/tv",
          status: "inspected",
          inspectedAt: "2026-11-02",
          observations: [
            { pattern: "moq-or-bulk-pricing", note: "MOQ", evidence: "MOQ: 10 Piece" },
          ],
          strengths: [],
          applicability: "Show MOQ with price.",
        },
      ],
    }),
  );
  if (!r.ok) throw new Error(r.errors.join("; "));
  return r.file;
})();

const inputs = { ranking: null, benchmark, products: [TV], ctx: parsePdpContext("{}") };

const aiConcept = (n: number, overrides: Record<string, unknown> = {}) => ({
  name: `Design ${n}`,
  tagline: `Tagline ${n}`,
  bestFor: "Buyers comparing specs",
  firstFold: ["gallery", "title", "price", "highlights", "cta"],
  below: ["specs", "seller"],
  keyIsq: ["Screen Size", "Resolution"],
  ctaPrimary: "Get Latest Price",
  ctaSecondary: "Send Enquiry",
  rationale: [`Spec tables are on most benchmark pages [1]`],
  benchmarkRefs: [1],
  ...overrides,
});

describe("AI design validation", () => {
  it("keeps valid AI decisions and fills every block once", () => {
    const { concepts, corrections } = validateDesign(
      { concepts: [1, 2, 3, 4, 5].map((n) => aiConcept(n)) },
      inputs,
    );
    expect(corrections).toEqual([]);
    expect(concepts.map((c) => c.id)).toEqual(["ai-1", "ai-2", "ai-3", "ai-4", "ai-5"]);
    const c = concepts[0]!;
    expect(c).toMatchObject({
      source: "ai",
      firstFold: ["gallery", "title", "price", "highlights", "cta"],
      keyIsq: ["Screen Size", "Resolution"],
      cta: { primary: "Get Latest Price", secondary: "Send Enquiry" },
      benchmarkRefs: [{ site: "shop.example", url: "https://shop.example/tv" }],
    });
    expect([...c.firstFold, ...c.below].sort()).toEqual([...ALL_BLOCKS].sort());
  });

  it("drops invented ISQ names, non-IndiaMART labels, unknown blocks and bad page numbers", () => {
    const { concepts, corrections } = validateDesign(
      {
        concepts: [
          aiConcept(1, {
            firstFold: ["hero-video", "title", "price"],
            keyIsq: ["Screen Size", "Refresh Rate 240Hz"],
            ctaPrimary: "Buy Now — 50% OFF",
            benchmarkRefs: [1, 9, "x"],
          }),
        ],
      },
      inputs,
    );
    const c = concepts[0]!;
    expect(c.firstFold).toEqual(["title", "price"]);
    expect(c.keyIsq).toEqual(["Screen Size"]);
    expect(c.cta?.primary).toBe("Get Best Price");
    expect(c.benchmarkRefs).toEqual([{ site: "shop.example", url: "https://shop.example/tv" }]);
    expect(corrections.join(" ")).toMatch(/unknown or extra above-the-fold blocks/);
    expect(corrections.join(" ")).toMatch(/"Refresh Rate 240Hz" is not an ISQ/);
    expect(corrections.join(" ")).toMatch(/"Buy Now — 50% OFF" is not an IndiaMART label/);
    // Only one usable design: the rest are fixed strategies, marked as such.
    expect(concepts).toHaveLength(5);
    expect(concepts.slice(1).every((x) => x.source === "fixed")).toBe(true);
    expect(corrections.join(" ")).toMatch(/gave 1 usable design/);
  });

  it("falls back to five fixed strategies when the answer is unreadable", () => {
    const { concepts, corrections } = validateDesign(null, inputs);
    expect(concepts).toHaveLength(5);
    expect(concepts.every((c) => c.source === "fixed")).toBe(true);
    expect(corrections[0]).toBe("The AI's answer could not be read.");
  });

  it("gives the AI facts only: which data exists, never product values", () => {
    const brief = buildDesignBrief(inputs, { name: "32 inch LED TV", id: "650708" });
    expect(availableIsqNames([TV])).toEqual(["Screen Size", "Resolution", "Warranty"]);
    expect(brief).toContain(
      "ISQ names available in the products: Screen Size, Resolution, Warranty",
    );
    expect(brief).toContain("[1] shop.example (ecommerce)");
    expect(brief).not.toContain("1366 x 768");
    expect(brief).not.toContain("7800");
    // IndiaMART Msite design guide rules are part of the brief.
    expect(brief).toContain("IndiaMART Msite design guidelines");
    expect(brief).toContain("#1d8480");
    expect(brief).toContain("Never stack more than 2 CTAs");
  });

  it("saves and reloads the AI design with the brief; older saves load without one", () => {
    const { concepts } = validateDesign(
      { concepts: [1, 2, 3, 4, 5].map((n) => aiConcept(n)) },
      inputs,
    );
    let state = studioReducer(createDefaultState(), { type: "generate" });
    state = studioReducer(state, {
      type: "setAiDesign",
      design: {
        concepts,
        model: "m",
        createdAt: "2026-11-02T00:00:00Z",
        corrections: [],
        cost: 0.002,
        benchmarkPages: 2,
      },
    });
    state = studioReducer(state, { type: "setPreferred", id: "ai-3" });
    const loaded = deserializeState(serializeState(state));
    expect(loaded).toEqual({ status: "loaded", state });

    const v2 = JSON.parse(serializeState(createDefaultState())) as Record<string, unknown>;
    delete v2["aiDesign"];
    v2["version"] = 2;
    const old = deserializeState(JSON.stringify(v2));
    expect(old.status === "loaded" && old.state.aiDesign).toBeNull();
  });
});

describe("reading the AI's answer", () => {
  const five = [1, 2, 3, 4, 5].map((n) => aiConcept(n));

  it("accepts the common shapes models return", () => {
    for (const text of [
      JSON.stringify({ concepts: five }),
      JSON.stringify(five),
      JSON.stringify({ designs: five }),
      "Here are the designs:\n```json\n" + JSON.stringify({ layouts: five }) + "\n```",
    ]) {
      const answer = parseDesignAnswer(text);
      expect(Array.isArray(answer?.["concepts"])).toBe(true);
      expect((answer!["concepts"] as unknown[]).length).toBe(5);
    }
    expect(parseDesignAnswer("")).toBeNull();
    expect(parseDesignAnswer('{"concepts": [{"name": "cut off')).toBeNull();
  });

  const settings = { baseUrl: "https://openrouter.ai/api/v1", model: "m", apiKey: "k" };
  const reply = (content: string, finish = "stop") =>
    new Response(
      JSON.stringify({
        choices: [{ message: { content }, finish_reason: finish }],
        usage: { cost: 0.001 },
      }),
      { headers: { "Content-Type": "application/json" } },
    );

  it("retries once when the first answer is empty, and keeps the reason", async () => {
    const answers = [reply(""), reply(JSON.stringify(five))];
    const result = await designConcepts({
      provider: "openrouter",
      settings,
      inputs,
      mcat: { name: "TV", id: "" },
      fetchImpl: (async () => answers.shift()!) as typeof fetch,
    });
    expect(result.concepts.every((c) => c.source === "ai")).toBe(true);
    expect(result.corrections[0]).toMatch(/First answer: the model returned no text/);
    expect(result.cost).toBeCloseTo(0.002, 6);
  });

  it("fails with the exact reason instead of quietly showing fixed layouts", async () => {
    const answers = [
      reply('{"concepts": [{"name": "x"', "length"),
      reply('{"concepts": [{"name"', "length"),
    ];
    await expect(
      designConcepts({
        provider: "openrouter",
        settings,
        inputs,
        mcat: { name: "TV", id: "" },
        fetchImpl: (async () => answers.shift()!) as typeof fetch,
      }),
    ).rejects.toThrow(/the answer was cut off before it was complete, twice\. Try another model/);
  });
});

describe("Generate with AI", () => {
  beforeEach(() => window.localStorage.clear());

  function fakeAi(answer: unknown) {
    const bodies: Record<string, unknown>[] = [];
    const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).endsWith("/models")) return new Response(JSON.stringify({ data: [] }));
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(answer) } }],
          usage: { cost: 0.0021 },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;
    return { fetchImpl, bodies };
  }

  it("shows the AI's five designs with real product data, its reasoning and sources", async () => {
    const ai = fakeAi({
      concepts: [1, 2, 3, 4, 5].map((n) => aiConcept(n, { benchmarkRefs: [] })),
    });
    const { id: _id, ...tvFields } = TV;
    const productFetch = async (displayId: string) => ({
      ok: true as const,
      data: {
        displayId,
        mcatId: "650708",
        mcatName: "32 inch LED TV",
        seller: { name: "", city: "" },
        product: tvFields,
      },
    });
    render(<PdpStudio aiFetch={ai.fetchImpl} productFetch={productFetch} />);
    fireEvent.change(screen.getByLabelText("OpenRouter key"), {
      target: { value: "sk-or-v1-test" },
    });
    fireEvent.change(screen.getByLabelText("MCAT name"), { target: { value: "32 inch LED TV" } });
    // Real product data comes from an IndiaMART listing.
    fireEvent.change(screen.getByLabelText("Product 1 IndiaMART URL or ID"), {
      target: { value: "2851707213873" },
    });
    await act(async () => {
      fireEvent.click(
        within(screen.getByLabelText("Brief product 1")).getByRole("button", {
          name: "Use this listing",
        }),
      );
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Generate 5 AI Designs" }));
    });

    expect(ai.bodies).toHaveLength(1);
    expect(await screen.findByLabelText("Design source")).toHaveTextContent(
      "AI-designed by qwen/qwen3.8-flash from 0 inspected benchmark page(s)",
    );
    expect(screen.getByLabelText("Design source")).toHaveTextContent("cost $0.0021");
    expect(screen.getAllByText("AI design")).toHaveLength(5);
    expect(screen.getByText("1. Design 1")).toBeInTheDocument();
    expect(
      within(screen.getByLabelText("Design 1 is built from")).getByText(/^AI's reasoning:/),
    ).toBeInTheDocument();

    // Featured ISQ chips show the product's real values.
    const frame = screen.getByRole("region", { name: /^Design 1 preview/ });
    const chips = within(frame).getByLabelText("Key specifications");
    expect(chips).toHaveTextContent("Screen Size: 32 inch");
    expect(chips).toHaveTextContent("Resolution: 1366 x 768");
    expect(within(frame).getByText("Get Latest Price")).toBeInTheDocument();
  });

  it("falls back to fixed strategies and says why when the AI call fails", async () => {
    const failing = (async (url: RequestInfo | URL) =>
      String(url).endsWith("/models")
        ? new Response(JSON.stringify({ data: [] }))
        : new Response(JSON.stringify({ error: { message: "Insufficient credits" } }), {
            status: 402,
          })) as typeof fetch;
    render(<PdpStudio aiFetch={failing} />);
    fireEvent.change(screen.getByLabelText("OpenRouter key"), {
      target: { value: "sk-or-v1-test" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Generate 5 AI Designs" }));
    });
    expect(await screen.findByLabelText("Design source")).toHaveTextContent(
      "The AI design failed (HTTP 402 — Insufficient credits), so the fixed strategies are shown.",
    );
    expect(screen.queryByText("AI design")).not.toBeInTheDocument();
  });

  it("uses fixed strategies without an AI key", () => {
    render(<PdpStudio />);
    fireEvent.click(screen.getByRole("button", { name: "Generate 5 AI Designs" }));
    expect(screen.getByLabelText("Design source")).toHaveTextContent(
      "Fixed layout strategies. Add your AI key",
    );
  });
});
