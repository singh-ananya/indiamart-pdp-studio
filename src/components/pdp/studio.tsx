import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { Monitor, Search, Smartphone, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ConceptPreview } from "@/components/pdp/concept-preview";
import { ImageUrlField } from "@/components/pdp/image-url-field";
import { McatConfigPanel, McatRankingSummary } from "@/components/pdp/mcat-config-panel";
import {
  BenchmarkPanel,
  RecommendationPanel,
  SourcesPanel,
  type ResearchControl,
} from "@/components/pdp/panels";
import { ProductPicker } from "@/components/pdp/product-picker";
import { StudioFileControls } from "@/components/pdp/studio-file-controls";
import { ViewportControls } from "@/components/pdp/viewport-controls";
import { AiKeyPanel } from "@/components/pdp/ai-key-panel";
import { ProductSourceRow } from "@/components/pdp/product-source-row";
import { useAiSettings } from "@/hooks/use-ai-settings";
import { useProductSources } from "@/hooks/use-product-sources";
import type { IndiaMartResult, IndiaMartSeller, SearchResult } from "@/lib/indiamart/product";
import { useBenchmarks } from "@/hooks/use-benchmarks";
import { useMcatConfig } from "@/hooks/use-mcat-config";
import { usePdpStudio } from "@/hooks/use-pdp-studio";
import { designConcepts } from "@/lib/ai/design";
import { runBenchmarkResearch, type ResearchResult } from "@/lib/ai/research";
import { benchmarkMatchesMcat, inspectedEntries } from "@/lib/pdp/benchmark";
import type { BenchmarkRemote } from "@/lib/pdp/benchmark-store";
import { CONCEPTS, generateConcepts } from "@/lib/pdp/concepts";
import { EMPTY_PRODUCT } from "@/lib/pdp/demo-data";
import type { FoldReport } from "@/lib/pdp/devices";
import { getMcatRanking, levelText } from "@/lib/pdp/mcat-config";
import {
  isAllowedEmail,
  type McatConfigCache,
  type McatConfigRemote,
} from "@/lib/pdp/mcat-config-store";
import { parsePdpContext } from "@/lib/pdp/schema";
import { rankScores, scoreConcept } from "@/lib/pdp/scoring";
import type { Product } from "@/lib/pdp/types";

function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; icon: ReactNode }[];
  label: string;
}) {
  return (
    <div className="space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="inline-flex rounded-lg border bg-muted p-0.5">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={
              value === option.value
                ? "inline-flex items-center gap-1.5 rounded-md bg-background px-3 py-1.5 text-xs font-medium shadow-sm"
                : "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground"
            }
          >
            {option.icon}
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

interface ProductCardEditorProps {
  product: Product;
  index: number;
  onChange: (patch: Partial<Product>) => void;
}

function ProductCardEditor({ product, index, onChange }: ProductCardEditorProps) {
  const n = index + 1;
  return (
    <Card className="bg-muted/30">
      <CardContent className="space-y-2.5 pt-5">
        <p className="text-xs font-semibold text-muted-foreground">Product {n}</p>
        <Input
          value={product.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Product name"
          aria-label={`Product ${n} name`}
        />
        <div className="grid grid-cols-2 gap-2">
          <Input
            value={product.price}
            onChange={(e) => onChange({ price: e.target.value })}
            placeholder="Price ₹"
            aria-label={`Product ${n} price`}
          />
          <Input
            value={product.priceMax}
            onChange={(e) => onChange({ priceMax: e.target.value })}
            placeholder="Max price ₹ (optional)"
            aria-label={`Product ${n} maximum price`}
          />
          <Input
            value={product.unit}
            onChange={(e) => onChange({ unit: e.target.value })}
            placeholder="Unit, e.g. piece"
            aria-label={`Product ${n} unit`}
          />
          <Input
            value={product.moq}
            onChange={(e) => onChange({ moq: e.target.value })}
            placeholder="MOQ"
            aria-label={`Product ${n} MOQ`}
          />
        </div>
        <Textarea
          rows={2}
          value={product.highlights}
          onChange={(e) => onChange({ highlights: e.target.value })}
          placeholder="Highlights, comma separated"
          aria-label={`Product ${n} highlights`}
        />
        <Textarea
          rows={3}
          className="font-mono text-xs"
          value={product.specs}
          onChange={(e) => onChange({ specs: e.target.value })}
          placeholder={"ISQ / specs, one per line:\nMaterial: Steel"}
          aria-label={`Product ${n} specs`}
        />
        <Textarea
          rows={2}
          value={product.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="Short description"
          aria-label={`Product ${n} description`}
        />
        <ImageUrlField
          urls={product.imageUrls}
          onChange={(imageUrls) => onChange({ imageUrls })}
          label={`Product ${n} image URLs`}
        />
      </CardContent>
    </Card>
  );
}

interface PdpStudioProps {
  /** MCAT configuration storage; defaults to Supabase plus this browser's IndexedDB cache. */
  mcatStorage?: { remote?: McatConfigRemote; cache?: McatConfigCache };
  /** Benchmark research storage; defaults to Supabase. */
  benchmarkRemote?: BenchmarkRemote;
  /** Network access for the AI provider; injected in tests. */
  aiFetch?: typeof fetch;
  /** Reads one IndiaMART product; defaults to the app's server function. */
  productFetch?: (displayId: string) => Promise<IndiaMartResult>;
  /** Searches IndiaMART by product name; defaults to the app's server function. */
  productSearch?: (query: string) => Promise<SearchResult>;
}

/** Loaded on demand so the server-function module is only pulled in when used. */
const defaultProductFetch = async (displayId: string): Promise<IndiaMartResult> => {
  const { fetchIndiaMartProduct } = await import("@/lib/indiamart/product-server");
  return fetchIndiaMartProduct({ data: { displayId } });
};
const defaultProductSearch = async (query: string): Promise<SearchResult> => {
  const { searchIndiaMartProducts } = await import("@/lib/indiamart/product-server");
  return searchIndiaMartProducts({ data: { query } });
};

export function PdpStudio({
  mcatStorage,
  benchmarkRemote,
  aiFetch,
  productFetch = defaultProductFetch,
  productSearch = defaultProductSearch,
}: PdpStudioProps = {}) {
  const ai = useAiSettings();
  const { state, dispatch, revision, saveStatus, loadWarning, importText, reset, replaceProduct } =
    usePdpStudio();
  const { mcat, mcatId, contextJson, products, device, fold, snapshot, preferredId } = state;
  const sources = useProductSources({
    search: productSearch,
    fetchProduct: productFetch,
    mcatId,
    onFetched: replaceProduct,
  });
  const [findingAll, setFindingAll] = useState(false);
  const namedCount = products.filter((p) => p.name.trim().length >= 2).length;
  const mcatConfig = useMcatConfig(mcatStorage);
  const activeConfig = mcatConfig.active;

  const [tab, setTab] = useState("concepts");

  const liveCtx = useMemo(() => parsePdpContext(contextJson), [contextJson]);

  /** Merge a fetched seller into the JSON context; returns a message for the user. */
  const applySeller = (seller: IndiaMartSeller): string | null => {
    let current: Record<string, unknown>;
    try {
      const parsed = JSON.parse(contextJson.trim() || "{}") as unknown;
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error();
      current = parsed as Record<string, unknown>;
    } catch {
      return "The JSON context is not valid JSON, so it was not changed. Fix it first.";
    }
    const next: Record<string, unknown> = { ...current };
    if (seller.name) next["brand"] = seller.name;
    if (seller.city) next["city"] = seller.city;
    if (seller.rating !== undefined) next["sellerRating"] = seller.rating;
    if (seller.ratingCount !== undefined) next["ratingCount"] = seller.ratingCount;
    if (seller.gstVerified !== undefined) next["gstVerified"] = seller.gstVerified;
    if (seller.memberSince !== undefined) next["memberSince"] = seller.memberSince;
    dispatch({ type: "setContextJson", contextJson: JSON.stringify(next, null, 2) });
    return `Seller details added to the JSON Context${seller.name ? ` (${seller.name})` : ""}.`;
  };
  const snapshotCtx = useMemo(
    () => (snapshot ? parsePdpContext(snapshot.contextJson) : null),
    [snapshot],
  );
  const liveRanking = useMemo(
    () => (activeConfig ? getMcatRanking(activeConfig.config, mcatId) : null),
    [activeConfig, mcatId],
  );
  const snapshotRanking = useMemo(
    () => (activeConfig && snapshot ? getMcatRanking(activeConfig.config, snapshot.mcatId) : null),
    [activeConfig, snapshot],
  );

  const signedIn =
    mcatConfig.email !== null &&
    isAllowedEmail(mcatConfig.email) &&
    mcatConfig.status !== "not-configured";
  const benchmarks = useBenchmarks(signedIn, benchmarkRemote);

  const productNames = products.map((p) => p.name.trim()).filter(Boolean);
  const research: ResearchControl = {
    target: `${mcat.trim() || "the MCAT"}${mcatId.trim() ? ` (MCAT ${mcatId.trim()})` : ""}${
      productNames.length > 0 ? ` and ${productNames.length} product name(s)` : ""
    }`,
    blockedReason: !signedIn
      ? "Sign in (MCAT configuration card) first — results are saved to Saved research."
      : ai.settings.provider !== "openrouter"
        ? "Web research needs OpenRouter. Switch the provider in Your AI key."
        : !ai.active.apiKey.trim()
          ? "Enter your OpenRouter key in Your AI key."
          : !ai.active.model.trim()
            ? "Choose a model in Your AI key."
            : !mcat.trim()
              ? "Enter the MCAT name in the brief."
              : null,
    run: async (onProgress, signal) => {
      let result: ResearchResult;
      try {
        result = await runBenchmarkResearch({
          provider: ai.settings.provider,
          settings: ai.active,
          input: { mcatName: mcat, mcatId, productNames },
          onProgress,
          signal,
          ...(aiFetch ? { fetchImpl: aiFetch } : {}),
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return { saved: false, errors: ["Cancelled before anything was saved."] };
        }
        return { saved: false, errors: [error instanceof Error ? error.message : String(error)] };
      }
      const saved = await benchmarks.importText(JSON.stringify(result.file));
      if (!saved.ok) return { saved: false, errors: saved.errors };
      const total = saved.set.file.entries.length;
      const inspected = inspectedEntries(saved.set.file).length;
      return {
        saved: true,
        summary: [
          `${total} product pages: ${inspected} inspected, ${total - inspected} could not be inspected.`,
          `${result.droppedObservations} AI observation(s) dropped because their quote was not on the page.`,
          result.cost !== null
            ? `Cost reported by OpenRouter: $${result.cost.toFixed(4)}.`
            : "OpenRouter did not report the cost for this run.",
          ...saved.warnings,
        ],
      };
    },
  };
  // Research for the generated MCAT, or for the brief's MCAT before anything is generated.
  const matchedBenchmark = useMemo(() => {
    const id = snapshot ? snapshot.mcatId : mcatId;
    const name = snapshot ? snapshot.mcat : mcat;
    return benchmarks.sets.find((s) => benchmarkMatchesMcat(s.file, id, name)) ?? null;
  }, [benchmarks.sets, snapshot, mcatId, mcat]);

  const aiDesign = state.aiDesign;
  const concepts = useMemo(
    () =>
      aiDesign
        ? aiDesign.concepts
        : snapshot
          ? generateConcepts({
              ranking: snapshotRanking,
              benchmark: matchedBenchmark?.file ?? null,
              products: snapshot.products,
              ctx: snapshotCtx,
            })
          : CONCEPTS,
    [aiDesign, snapshot, snapshotRanking, matchedBenchmark, snapshotCtx],
  );

  // AI design: runs after "Generate 5 Concepts" when an AI key is set.
  const aiReady = ai.active.apiKey.trim() !== "" && ai.active.model.trim() !== "";
  const [designStatus, setDesignStatus] = useState<
    { kind: "busy" } | { kind: "error"; text: string } | null
  >(null);
  const designRun = useRef<AbortController | null>(null);

  const generate = async () => {
    dispatch({ type: "generate" });
    designRun.current?.abort();
    if (!aiReady) {
      setDesignStatus(null);
      return;
    }
    const run = new AbortController();
    designRun.current = run;
    // The same inputs the snapshot is taking right now.
    const briefRanking = activeConfig ? getMcatRanking(activeConfig.config, mcatId.trim()) : null;
    const briefBenchmark =
      benchmarks.sets.find((s) => benchmarkMatchesMcat(s.file, mcatId.trim(), mcat.trim()))?.file ??
      null;
    const inputs = {
      ranking: briefRanking,
      benchmark: briefBenchmark,
      products,
      ctx: parsePdpContext(contextJson),
    };
    setDesignStatus({ kind: "busy" });
    try {
      const result = await designConcepts({
        provider: ai.settings.provider,
        settings: ai.active,
        inputs,
        mcat: { name: mcat.trim(), id: mcatId.trim() },
        signal: run.signal,
        ...(aiFetch ? { fetchImpl: aiFetch } : {}),
      });
      if (run.signal.aborted) return;
      dispatch({
        type: "setAiDesign",
        design: {
          concepts: result.concepts,
          model: ai.active.model.trim(),
          createdAt: new Date().toISOString(),
          corrections: result.corrections,
          cost: result.cost,
          benchmarkPages: inspectedEntries(briefBenchmark).length,
        },
      });
      setDesignStatus(null);
    } catch (error) {
      if (run.signal.aborted) return;
      setDesignStatus({
        kind: "error",
        text: `The AI design failed (${error instanceof Error ? error.message : String(error)}), so the fixed strategies are shown.`,
      });
    }
  };
  const previewProduct =
    snapshot?.products[state.previewProductIndex] ?? snapshot?.products[0] ?? EMPTY_PRODUCT;
  const viewport = state.viewports[device];

  // Fold reports arrive from the measured previews. Each is stored with what it was
  // measured on, and only reports matching the current settings are scored.
  const measurementKey = JSON.stringify([
    concepts.map((c) => [c.id, c.firstFold, c.below]),
    previewProduct,
    snapshot?.contextJson ?? "",
    device,
    viewport,
  ]);
  const [reports, setReports] = useState<Record<string, { key: string; report: FoldReport }>>({});
  const handleReport = useCallback(
    (conceptId: string, report: FoldReport) => {
      setReports((prev) => {
        const current = prev[conceptId];
        if (
          current?.key === measurementKey &&
          JSON.stringify(current.report) === JSON.stringify(report)
        ) {
          return prev;
        }
        return { ...prev, [conceptId]: { key: measurementKey, report } };
      });
    },
    [measurementKey],
  );
  const scores = useMemo(() => {
    if (!snapshot) return null;
    const measured = concepts.map((c) => reports[c.id]);
    if (measured.some((m) => !m || m.key !== measurementKey)) return null;
    return rankScores(
      concepts.map((c, i) =>
        scoreConcept(c, measured[i]!.report, {
          ranking: snapshotRanking,
          benchmark: matchedBenchmark?.file ?? null,
          product: previewProduct,
          ctx: snapshotCtx,
        }),
      ),
    );
  }, [
    snapshot,
    concepts,
    reports,
    measurementKey,
    snapshotRanking,
    matchedBenchmark,
    previewProduct,
    snapshotCtx,
  ]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl flex-col gap-1.5 px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">
              MCAT config shared via Supabase · @indiamart.com sign-in
            </Badge>
          </div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">PDP Genie</h1>
          <p className="text-sm text-muted-foreground">
            UI/UX benchmarking and layout concepts for IndiaMART product detail pages. Everything
            you see is for layout design only.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        {loadWarning && (
          <p
            role="alert"
            className="rounded-md border border-destructive/50 px-3 py-2 text-xs text-destructive"
          >
            {loadWarning}
          </p>
        )}
        <McatConfigPanel mcat={mcatConfig} />
        <AiKeyPanel ai={ai} fetchImpl={aiFetch} />
        <Card>
          <CardHeader>
            <CardTitle>Step 1 — Brief</CardTitle>
            <CardDescription>
              Set the MCAT and preview options, fill the Product Cards and JSON Context tabs, then
              generate five layout concepts.
            </CardDescription>
            <StudioFileControls
              state={state}
              saveStatus={saveStatus}
              onImportText={importText}
              onReset={reset}
            />
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="mcat">MCAT name</Label>
                <Input
                  id="mcat"
                  value={mcat}
                  onChange={(event) => dispatch({ type: "setMcat", mcat: event.target.value })}
                  placeholder="e.g. 32 inch LED TV"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mcat-id">MCAT ID</Label>
                <Input
                  id="mcat-id"
                  inputMode="numeric"
                  value={mcatId}
                  onChange={(event) => dispatch({ type: "setMcatId", mcatId: event.target.value })}
                  placeholder="e.g. 1"
                  aria-describedby="mcat-id-status"
                />
                <p id="mcat-id-status" className="text-xs text-muted-foreground">
                  {!activeConfig
                    ? "Load an MCAT configuration to look IDs up."
                    : !mcatId.trim()
                      ? "Optional — connects the concepts to this MCAT's configuration."
                      : liveRanking
                        ? `Found: ${liveRanking
                            .map((e) => `${e.dimension ?? e.raw.dimension} ${levelText(e)}`)
                            .join(", ")}`
                        : "Not in the active configuration."}
                </p>
              </div>
              <Segmented
                label="Preview device"
                value={device}
                onChange={(value) => dispatch({ type: "setDevice", device: value })}
                options={[
                  { value: "mobile", label: "Mobile", icon: <Smartphone className="size-3.5" /> },
                  { value: "desktop", label: "Desktop", icon: <Monitor className="size-3.5" /> },
                ]}
              />
              <Segmented
                label="Page view"
                value={fold}
                onChange={(value) => dispatch({ type: "setFold", fold: value })}
                options={[
                  { value: "first", label: "First Fold", icon: null },
                  { value: "full", label: "Full PDP", icon: null },
                ]}
              />
              <ViewportControls
                device={device}
                viewport={state.viewports[device]}
                onChange={(viewport) => dispatch({ type: "setViewport", device, viewport })}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label>Products (five)</Label>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={findingAll || namedCount === 0}
                  onClick={() => {
                    setFindingAll(true);
                    void sources
                      .findAll(products.map((p) => ({ id: p.id, name: p.name })))
                      .finally(() => setFindingAll(false));
                  }}
                >
                  <Search className="size-3.5" />
                  {findingAll ? "Finding on IndiaMART…" : "Find all on IndiaMART"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Type the product names, then Find on IndiaMART: each name is matched to a real
                IndiaMART listing, and its photos, price, ISQ and description are filled in. You can
                switch to another listing if the match is wrong.
              </p>
              <div className="space-y-2">
                {products.map((product, index) => (
                  <ProductSourceRow
                    key={product.id}
                    index={index}
                    product={product}
                    state={sources.states[product.id] ?? sources.empty}
                    onNameChange={(name) =>
                      dispatch({ type: "updateProduct", id: product.id, patch: { name } })
                    }
                    onFind={() => void sources.find(product.id, product.name)}
                    onChoose={(displayId) => void sources.choose(product.id, displayId)}
                    onUseSeller={applySeller}
                  />
                ))}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Everything else is optional: edit details in the{" "}
              <span className="font-medium">Product Cards</span> tab; seller and category details go
              in the <span className="font-medium">JSON Context</span> tab.
            </p>
            {!liveCtx.ok && (
              <p role="alert" className="text-xs text-destructive">
                The JSON context has {liveCtx.issues.length > 1 ? "problems" : "a problem"}, so
                previews will not use it.{" "}
                <button
                  type="button"
                  className="font-medium underline underline-offset-2"
                  onClick={() => setTab("context")}
                >
                  Open the JSON Context tab
                </button>
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Button
                size="lg"
                className="w-full sm:w-auto"
                disabled={designStatus?.kind === "busy"}
                onClick={() => {
                  setTab("concepts");
                  void generate();
                }}
              >
                <Sparkles className="size-4" />
                Generate 5 Concepts
              </Button>
              <span className="text-xs text-muted-foreground">
                {aiReady
                  ? `The AI (${ai.active.model.trim()}) designs the 5 layouts from the benchmark research.`
                  : "Add your AI key above to get AI-designed layouts; fixed strategies are used without it."}
              </span>
            </div>
          </CardContent>
        </Card>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="h-auto flex-wrap">
            <TabsTrigger value="concepts">Five Concepts</TabsTrigger>
            <TabsTrigger value="products">Product Cards</TabsTrigger>
            <TabsTrigger value="context">JSON Context</TabsTrigger>
            <TabsTrigger value="benchmark">Benchmark Comparison</TabsTrigger>
            <TabsTrigger value="sources">Sources</TabsTrigger>
            <TabsTrigger value="recommendation">Final Recommendation</TabsTrigger>
          </TabsList>

          <TabsContent value="concepts" className="mt-4 space-y-4">
            {!snapshot || !snapshotCtx ? (
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  No concepts yet — fill the brief above and press &quot;Generate 5 Concepts&quot;.
                </CardContent>
              </Card>
            ) : (
              <>
                <ProductPicker
                  products={snapshot.products}
                  selectedIndex={state.previewProductIndex}
                  onSelect={(index) => dispatch({ type: "setPreviewProduct", index })}
                />
                <p className="text-sm text-muted-foreground">
                  All five concepts show the same product, so differences come from the layout
                  alone. Edit inputs and press Generate again to refresh previews.
                </p>
                <McatRankingSummary
                  mcatId={snapshot.mcatId}
                  ranking={snapshotRanking}
                  active={activeConfig}
                />
                <div
                  aria-label="Design source"
                  className="space-y-1 rounded-md border px-3 py-2 text-sm"
                >
                  {designStatus?.kind === "busy" ? (
                    <p role="status">
                      The AI is designing 5 layouts from the MCAT ranking, the benchmark research
                      and your product data… The fixed strategies are shown until it finishes.
                    </p>
                  ) : aiDesign ? (
                    <>
                      <p>
                        <span className="font-medium">AI-designed</span> by {aiDesign.model} from{" "}
                        {aiDesign.benchmarkPages} inspected benchmark page(s), the MCAT ranking and
                        your product data
                        {aiDesign.cost !== null && ` · cost $${aiDesign.cost.toFixed(4)}`}. All
                        product data shown is real; the AI chose only the layout and emphasis.
                      </p>
                      {aiDesign.corrections.length > 0 && (
                        <details className="text-xs text-muted-foreground">
                          <summary className="cursor-pointer">
                            {aiDesign.corrections.length} correction(s) the app made to the
                            AI&apos;s answer
                          </summary>
                          <ul className="mt-1 list-inside list-disc">
                            {aiDesign.corrections.map((line) => (
                              <li key={line}>{line}</li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </>
                  ) : (
                    <p className="text-muted-foreground">
                      {designStatus?.kind === "error"
                        ? designStatus.text
                        : "Fixed layout strategies. Add your AI key (Your AI key) and press Generate to get AI-designed layouts."}
                    </p>
                  )}
                </div>
                <div className="grid gap-4 xl:grid-cols-2">
                  {concepts.map((concept, index) => {
                    const product = previewProduct;
                    return (
                      <Card key={concept.id} className="min-w-0">
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                                {index + 1}. {concept.name}
                                {concept.source === "ai" && (
                                  <Badge variant="secondary">AI design</Badge>
                                )}
                                {concept.source === "fixed" && aiDesign && (
                                  <Badge variant="outline">Fixed strategy</Badge>
                                )}
                              </CardTitle>
                              <CardDescription>{concept.tagline}</CardDescription>
                              {concept.rationale && concept.rationale.length > 0 && (
                                <ul
                                  className="mt-1.5 list-inside list-disc text-xs text-muted-foreground"
                                  aria-label={`${concept.name} is built from`}
                                >
                                  {concept.rationale.map((line) => (
                                    <li key={line}>
                                      {concept.source === "ai" ? `AI's reasoning: ${line}` : line}
                                    </li>
                                  ))}
                                </ul>
                              )}
                              {concept.benchmarkRefs && concept.benchmarkRefs.length > 0 && (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  Learned from:{" "}
                                  {concept.benchmarkRefs.map((ref, i) => (
                                    <span key={ref.url}>
                                      {i > 0 && ", "}
                                      <a
                                        href={ref.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="underline underline-offset-2"
                                      >
                                        {ref.site}
                                      </a>
                                    </span>
                                  ))}
                                </p>
                              )}
                            </div>
                            <Button
                              size="sm"
                              variant={preferredId === concept.id ? "default" : "outline"}
                              onClick={() => dispatch({ type: "setPreferred", id: concept.id })}
                            >
                              {preferredId === concept.id ? "Preferred" : "Mark preferred"}
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <ConceptPreview
                            concept={concept}
                            product={product}
                            ctx={snapshotCtx}
                            mcat={snapshot.mcat}
                            device={device}
                            fold={fold}
                            viewport={viewport}
                            mcatRanking={snapshotRanking}
                            onReport={handleReport}
                          />
                          <p className="text-xs text-muted-foreground">
                            <span className="font-medium">Best for:</span> {concept.bestFor}
                          </p>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </>
            )}
          </TabsContent>

          {/* Kept mounted (only hidden) so half-typed image URLs survive tab switches. */}
          <TabsContent
            value="products"
            forceMount
            hidden={tab !== "products"}
            className="mt-4 space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                Edit the five products, then press &quot;Generate 5 Concepts&quot; in the brief to
                refresh the previews.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {products.map((product, index) => (
                <ProductCardEditor
                  key={`${product.id}-${revision}`}
                  product={product}
                  index={index}
                  onChange={(patch) => dispatch({ type: "updateProduct", id: product.id, patch })}
                />
              ))}
            </div>
          </TabsContent>

          {/* The text lives in page state, so unmounting this tab loses nothing. */}
          <TabsContent value="context" className="mt-4 space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="context-json">JSON context editor</Label>
              {liveCtx.ok ? (
                <Badge variant="secondary">Valid JSON</Badge>
              ) : (
                <Badge variant="destructive">
                  {liveCtx.issues.length > 1
                    ? `${liveCtx.issues.length} problems`
                    : `Invalid: ${liveCtx.error}`}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Seller and category details shared by all five products. Press &quot;Generate 5
              Concepts&quot; in the brief to refresh the previews after editing.
            </p>
            <Textarea
              id="context-json"
              rows={12}
              className="font-mono text-xs"
              value={contextJson}
              onChange={(event) =>
                dispatch({ type: "setContextJson", contextJson: event.target.value })
              }
            />
            {!liveCtx.ok && (
              <ul className="list-inside list-disc text-xs text-destructive">
                {liveCtx.issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">
              Optional fields: isqAttributes, sellerRating, ratingCount, memberSince, gstVerified,
              verifiedSupplier, responseRate. Leave out anything you don&apos;t have — previews show
              it as not provided.
            </p>
          </TabsContent>

          <TabsContent value="benchmark" className="mt-4">
            <BenchmarkPanel
              value={state.benchmarkNotes}
              onChange={(notes) => dispatch({ type: "setBenchmarkNotes", notes })}
              benchmark={matchedBenchmark}
              allSets={benchmarks.sets}
              mcatLabel={
                (snapshot ? snapshot.mcat : mcat) +
                ((snapshot ? snapshot.mcatId : mcatId.trim())
                  ? ` (MCAT ${snapshot ? snapshot.mcatId : mcatId.trim()})`
                  : "")
              }
              canImport={signedIn && benchmarks.configured}
              loadErrors={benchmarks.errors}
              onImport={benchmarks.importText}
              research={research}
              onUseMcat={(name, id) => {
                dispatch({ type: "setMcat", mcat: name });
                dispatch({ type: "setMcatId", mcatId: id });
              }}
            />
          </TabsContent>

          <TabsContent value="sources" className="mt-4">
            <SourcesPanel
              mcat={snapshot ? snapshot.mcat : mcat}
              products={snapshot ? snapshot.products : products}
              ctx={snapshotCtx ?? liveCtx}
              contextJson={snapshot ? snapshot.contextJson : contextJson}
              mcatId={snapshot ? snapshot.mcatId : mcatId.trim()}
              mcatConfig={
                activeConfig && {
                  fileName: activeConfig.version.fileName,
                  version: activeConfig.version.version,
                  uploadedAt: activeConfig.version.uploadedAt,
                }
              }
              benchmark={matchedBenchmark}
            />
          </TabsContent>

          <TabsContent value="recommendation" className="mt-4">
            {snapshot && !scores && (
              <p className="mb-3 text-sm">
                The ranking uses measurements of the rendered previews.{" "}
                <button
                  type="button"
                  className="font-medium underline underline-offset-2"
                  onClick={() => setTab("concepts")}
                >
                  Open the Five Concepts tab
                </button>{" "}
                to measure them for the current product and screen size.
              </p>
            )}
            <RecommendationPanel
              concepts={concepts}
              preferredId={preferredId}
              onPick={(id) => dispatch({ type: "setPreferred", id })}
              scores={scores}
              scoreBasis={`Product ${state.previewProductIndex + 1} on ${device} ${viewport.width} × ${viewport.height}`}
            />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
