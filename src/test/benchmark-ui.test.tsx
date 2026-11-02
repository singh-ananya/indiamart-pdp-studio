import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { PdpStudio } from "@/components/pdp/studio";
import { parseBenchmarkText } from "@/lib/pdp/benchmark";
import { createMemoryBenchmarkRemote } from "@/lib/pdp/benchmark-store";
import { sha256Hex } from "@/lib/pdp/mcat-config";
import { createMemoryCache, createMemoryRemote } from "@/lib/pdp/mcat-config-store";

const USER = "tester@indiamart.com";

const mcatFile = async () => {
  const text = JSON.stringify({
    version: "v1",
    mcats: {
      "42": {
        importance_ranking: [
          { Dimension: "specification", Level: "High", Rank: "1", Show: "Yes" },
          { Dimension: "price", Level: "High", Rank: "2", Show: "Yes" },
          { Dimension: "image", Level: "Medium", Rank: "3", Show: "Yes" },
          { Dimension: "company", Level: "Low", Rank: "4", Show: "Yes" },
          { Dimension: "unit", Level: "Low", Rank: "5", Show: "No" },
        ],
      },
    },
  });
  const bytes = new TextEncoder().encode(text);
  return {
    bytes,
    sha256: await sha256Hex(bytes),
    version: {
      version: "v1",
      fileName: "mcatcontext.json",
      mcatCount: 1,
      warnings: [],
      uploadedBy: USER,
      uploadedAt: "2026-11-01T10:00:00.000Z",
    },
  };
};

const benchmarkJson = (mcatId = "42") =>
  JSON.stringify({
    app: "indiamart-pdp-studio-benchmark",
    version: 1,
    mcat: { name: "Steel Pipes", id: mcatId },
    researchedAt: "2026-11-02",
    method: "Web search, then each page opened and read.",
    entries: [
      {
        site: "Example B2B",
        type: "b2b",
        url: "https://b2b.example/steel-pipe",
        status: "inspected",
        inspectedAt: "2026-11-02",
        observations: [
          {
            pattern: "specs-above-fold",
            note: "Spec table under the title",
            evidence: "“Outer Diameter: 25 mm” shown before scrolling",
          },
          { pattern: "moq-or-bulk-pricing", note: "Tier prices", evidence: "“1-99 kg ₹70”" },
        ],
        strengths: ["Specs visible immediately"],
        applicability: "IndiaMART could surface ISQ rows above the fold.",
      },
      {
        site: "Blocked Market",
        type: "ecommerce",
        url: "https://blocked.example/pipe",
        status: "not-inspected",
        reason: "HTTP 403 (bot protection)",
      },
    ],
  });

function openTab(name: string) {
  fireEvent.mouseDown(screen.getByRole("tab", { name }), { button: 0, ctrlKey: false });
}

async function setup() {
  const benchmarkRemote = createMemoryBenchmarkRemote();
  render(
    <PdpStudio
      mcatStorage={{
        remote: createMemoryRemote({ email: USER, files: [await mcatFile()] }),
        cache: createMemoryCache(),
      }}
      benchmarkRemote={benchmarkRemote}
    />,
  );
  await screen.findByLabelText("Active MCAT configuration");
  fireEvent.change(screen.getByLabelText("MCAT ID"), { target: { value: "42" } });
  return benchmarkRemote;
}

async function importBenchmark(contents: string, name = "steel-pipes.json") {
  openTab("Benchmark Comparison");
  const input = screen.getByLabelText("Benchmark research JSON file");
  await act(async () => {
    fireEvent.change(input, { target: { files: [new File([contents], name)] } });
  });
}

beforeEach(() => window.localStorage.clear());

describe("benchmark research in the app", () => {
  it("imports a research file and shows every page with source links, evidence and status", async () => {
    const remote = await setup();
    await importBenchmark(benchmarkJson());

    expect(
      await screen.findByText("Imported steel-pipes.json for Steel Pipes"),
    ).toBeInTheDocument();
    expect(remote.rows).toHaveLength(1);
    const results = screen.getByLabelText("Benchmark results");
    expect(
      within(results).getByText("2 pages listed · 1 inspected · 1 could not be inspected"),
    ).toBeInTheDocument();
    expect(within(results).getByRole("link", { name: /b2b\.example\/steel-pipe/ })).toHaveAttribute(
      "href",
      "https://b2b.example/steel-pipe",
    );
    expect(within(results).getByText("Could not be inspected")).toBeInTheDocument();
    expect(within(results).getByText("Reason: HTTP 403 (bot protection)")).toBeInTheDocument();
    expect(within(results).getByText(/Outer Diameter: 25 mm/)).toBeInTheDocument();

    openTab("Sources");
    const sources = screen.getByLabelText("Benchmark sources");
    expect(within(sources).getAllByRole("link")).toHaveLength(2);
    expect(sources).toHaveTextContent("not inspected (HTTP 403 (bot protection))");
  });

  it("rejects an invalid research file and stores nothing", async () => {
    const remote = await setup();
    await importBenchmark(
      benchmarkJson().replace('"specs-above-fold"', '"invented-pattern"'),
      "bad.json",
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "bad.json was not imported — nothing changed",
    );
    expect(remote.rows).toHaveLength(0);
    expect(screen.queryByLabelText("Benchmark results")).not.toBeInTheDocument();
  });

  it("shapes the concepts and ranks all five with a visible breakdown", async () => {
    await setup();
    await importBenchmark(benchmarkJson());
    await screen.findByText("Imported steel-pipes.json for Steel Pipes");
    openTab("Five Concepts");
    fireEvent.click(screen.getByRole("button", { name: "Generate 5 Concepts" }));

    expect(
      within(screen.getByLabelText("Benchmark Consensus is built from")).getByText(
        /Key specifications before scrolling \(1\)/,
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByLabelText("MCAT Priority is built from")).getByText(
        /specification \(High\), price \(High\)/,
      ),
    ).toBeInTheDocument();

    openTab("Final Recommendation");
    const ranking = await screen.findByLabelText("Concept ranking");
    const items = within(ranking).getAllByRole("listitem");
    expect(items).toHaveLength(5);
    expect(within(items[0]!).getByText(/^#1 /)).toBeInTheDocument();
    for (const item of items) {
      expect(within(item).getByText("MCAT priorities above the fold")).toBeInTheDocument();
      expect(within(item).getByText("Benchmark patterns matched")).toBeInTheDocument();
      expect(within(item).getByText(/\/ 100$/)).toBeInTheDocument();
    }
  });

  it("lists saved research for every MCAT and can point the brief at one", async () => {
    const saved = parseBenchmarkText(benchmarkJson("777").replace('"Steel Pipes"', '"LED TV"'));
    if (!saved.ok) throw new Error(saved.errors.join("; "));
    render(
      <PdpStudio
        mcatStorage={{
          remote: createMemoryRemote({ email: USER, files: [await mcatFile()] }),
          cache: createMemoryCache(),
        }}
        benchmarkRemote={createMemoryBenchmarkRemote({
          sets: [{ id: 1, uploadedBy: USER, uploadedAt: "2026-11-02T10:00:00Z", file: saved.file }],
        })}
      />,
    );
    await screen.findByLabelText("Active MCAT configuration");
    openTab("Benchmark Comparison");

    const list = await screen.findByLabelText("Saved research");
    expect(list).toHaveTextContent("Saved research (1)");
    expect(list).toHaveTextContent("LED TV (MCAT 777)");
    expect(list).toHaveTextContent("1 of 2 pages inspected");
    expect(screen.queryByLabelText("Benchmark results")).not.toBeInTheDocument();

    fireEvent.click(within(list).getByRole("button", { name: "View saved research for LED TV" }));
    expect(screen.getByLabelText("Benchmark results")).toHaveTextContent("LED TV (MCAT 777)");

    fireEvent.click(screen.getByRole("button", { name: "Use this MCAT in the brief" }));
    expect(screen.getByLabelText("MCAT name")).toHaveValue("LED TV");
    expect(screen.getByLabelText("MCAT ID")).toHaveValue("777");
    // Now it is the brief's own research, shown without the "viewing other" note.
    expect(screen.getByLabelText("Benchmark results")).toHaveTextContent("LED TV (MCAT 777)");
    expect(
      screen.queryByRole("button", { name: "Use this MCAT in the brief" }),
    ).not.toBeInTheDocument();
  });

  it("asks for research rather than inventing it when none exists for the MCAT", async () => {
    await setup();
    openTab("Benchmark Comparison");
    await waitFor(() =>
      expect(screen.getByText(/No benchmark research imported for/)).toBeInTheDocument(),
    );
  });
});
