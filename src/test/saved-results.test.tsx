import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { PdpStudio } from "@/components/pdp/studio";
import { validateDesign } from "@/lib/ai/design";
import { createMemoryCache, createMemoryRemote } from "@/lib/pdp/mcat-config-store";
import { EMPTY_PRODUCT } from "@/lib/pdp/demo-data";
import { createMemorySavedResultsRemote, rowsToResults } from "@/lib/pdp/saved-results-store";
import { parsePdpContext } from "@/lib/pdp/schema";
import {
  serializeSavedResult,
  validateSavedResult,
  type SavedResultData,
} from "@/lib/pdp/studio-state";
import type { Product } from "@/lib/pdp/types";

const USER = "tester@indiamart.com";

const products: Product[] = Array.from({ length: 5 }, (_, i) => ({
  ...EMPTY_PRODUCT,
  id: `p${i + 1}`,
  name: i === 0 ? "32 Inch LED TV" : "",
  price: i === 0 ? "7800" : "",
  specs: i === 0 ? "Screen Size: 32 inch" : "",
  imageUrls: i === 0 ? ["https://5.imimg.com/tv-500x500.jpeg"] : [],
}));

const aiConcept = (n: number) => ({
  name: `Saved Design ${n}`,
  tagline: `Tagline ${n}`,
  bestFor: "Buyers",
  firstFold: ["gallery", "title", "price", "cta"],
  below: ["specs"],
  keyIsq: ["Screen Size"],
  ctaPrimary: "Call Supplier",
  ctaSecondary: "Send Inquiry",
  rationale: [`Reason ${n}`],
  benchmarkRefs: [],
});

function savedData(): SavedResultData {
  const { concepts } = validateDesign(
    { concepts: [1, 2, 3, 4, 5].map(aiConcept) },
    { ranking: null, benchmark: null, products, ctx: parsePdpContext("{}") },
  );
  return {
    mcat: "32 inch LED TV",
    mcatId: "650708",
    contextJson: JSON.stringify({ brand: "V & M Industries", city: "Noida" }),
    products,
    aiDesign: {
      concepts,
      model: "qwen/qwen3.8-flash",
      createdAt: "2026-11-03T09:00:00Z",
      corrections: [],
      cost: 0.002,
      benchmarkPages: 14,
    },
  };
}

const signedInStorage = () => ({
  remote: createMemoryRemote({ email: USER }),
  cache: createMemoryCache(),
});

beforeEach(() => window.localStorage.clear());

describe("saved result data", () => {
  it("round-trips and rejects anything invalid", () => {
    const data = savedData();
    const back = validateSavedResult(JSON.parse(JSON.stringify(serializeSavedResult(data))));
    expect(back).toEqual({ ok: true, data });
    expect(validateSavedResult({ version: 1, mcat: "x" }).ok).toBe(false);

    const { results, skipped } = rowsToResults([
      {
        id: 2,
        data: serializeSavedResult(data),
        created_by: USER,
        created_at: "2026-11-03T09:00:00Z",
      },
      { id: 1, data: { broken: true }, created_by: USER, created_at: "2026-11-02T09:00:00Z" },
    ]);
    expect(results.map((r) => r.id)).toEqual([2]);
    expect(skipped[0]).toMatch(/Saved result #1 could not be read and is hidden/);
  });
});

describe("View saved results", () => {
  it("opens a past result without an AI key and without calling the AI", async () => {
    let aiCalls = 0;
    // Count AI calls only; the AI key section also loads the free model list.
    const aiFetch = (async (url: RequestInfo | URL) => {
      if (String(url).endsWith("/chat/completions")) aiCalls++;
      return new Response(JSON.stringify({ data: [] }));
    }) as typeof fetch;
    const remote = createMemorySavedResultsRemote({
      results: [
        {
          id: 1,
          createdBy: "colleague@indiamart.com",
          createdAt: "2026-11-03T09:00:00Z",
          data: savedData(),
        },
      ],
    });
    render(
      <PdpStudio mcatStorage={signedInStorage()} savedResultsRemote={remote} aiFetch={aiFetch} />,
    );

    const button = await screen.findByRole("button", { name: "View saved results (1)" });
    fireEvent.click(button);
    const list = await screen.findByLabelText("Saved results list");
    expect(list).toHaveTextContent("32 inch LED TV (MCAT 650708)");
    expect(list).toHaveTextContent("5 AI design(s) by qwen/qwen3.8-flash · 14 benchmark page(s)");
    expect(list).toHaveTextContent("colleague@indiamart.com");

    fireEvent.click(
      within(list).getByRole("button", { name: /^Open saved result for 32 inch LED TV/ }),
    );

    expect(screen.getByLabelText("MCAT name")).toHaveValue("32 inch LED TV");
    expect(screen.getByLabelText("MCAT ID")).toHaveValue("650708");
    expect(screen.getAllByText("AI design")).toHaveLength(5);
    expect(screen.getByText("1. Saved Design 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Design source")).toHaveTextContent("Opened a saved result from");
    expect(screen.getByLabelText("Design source")).toHaveTextContent("No AI call was made.");
    const frame = screen.getByRole("region", { name: /^Saved Design 1 preview/ });
    expect(within(frame).getByText("₹7800")).toBeInTheDocument();
    expect(within(frame).getByText("Call Supplier")).toBeInTheDocument();
    expect(aiCalls).toBe(0);
  });

  it("saves every successful AI design run automatically", async () => {
    const answer = { concepts: [1, 2, 3, 4, 5].map(aiConcept) };
    const aiFetch = (async (url: RequestInfo | URL) =>
      String(url).endsWith("/models")
        ? new Response(JSON.stringify({ data: [] }))
        : new Response(
            JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }] }),
            {
              headers: { "Content-Type": "application/json" },
            },
          )) as typeof fetch;
    const remote = createMemorySavedResultsRemote();
    render(
      <PdpStudio mcatStorage={signedInStorage()} savedResultsRemote={remote} aiFetch={aiFetch} />,
    );
    await screen.findByRole("button", { name: "View saved results (0)" });

    fireEvent.change(screen.getByLabelText("OpenRouter key"), {
      target: { value: "sk-or-v1-test" },
    });
    fireEvent.change(screen.getByLabelText("MCAT name"), { target: { value: "32 inch LED TV" } });
    fireEvent.change(screen.getByLabelText("Brief product 1 name"), { target: { value: "My TV" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Generate 5 AI Designs" }));
    });

    expect(
      await screen.findByText(/Added to Saved results — anyone signed in can open it/),
    ).toBeInTheDocument();
    expect(remote.rows).toHaveLength(1);
    expect(remote.rows[0]!.data).toMatchObject({ mcat: "32 inch LED TV" });
    expect(remote.rows[0]!.data.products[0]!.name).toBe("My TV");
    expect(remote.rows[0]!.data.aiDesign.concepts).toHaveLength(5);
    expect(screen.getByRole("button", { name: "View saved results (1)" })).toBeInTheDocument();
  });

  it("closes the dialog and scrolls to the designs after Open", async () => {
    const scrolled: string[] = [];
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this.id);
    };
    try {
      const remote = createMemorySavedResultsRemote({
        results: [{ id: 1, createdBy: USER, createdAt: "2026-11-03T09:00:00Z", data: savedData() }],
      });
      render(<PdpStudio mcatStorage={signedInStorage()} savedResultsRemote={remote} />);
      fireEvent.click(await screen.findByRole("button", { name: "View saved results (1)" }));
      const list = await screen.findByLabelText("Saved results list");
      fireEvent.click(within(list).getByRole("button", { name: /^Open saved result/ }));
      expect(screen.queryByLabelText("Saved results list")).not.toBeInTheDocument();
      await act(async () => {
        await new Promise((r) => setTimeout(r, 80));
      });
      expect(scrolled).toContain("pdp-designs");
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });

  it("is disabled when signed out", () => {
    render(<PdpStudio savedResultsRemote={createMemorySavedResultsRemote()} />);
    expect(screen.getByRole("button", { name: "Sign in to view saved results" })).toBeDisabled();
  });
});
