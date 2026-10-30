import { useMemo, useState, type ReactNode } from "react";
import { Monitor, Smartphone, Sparkles } from "lucide-react";
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
import { BenchmarkPanel, RecommendationPanel, SourcesPanel } from "@/components/pdp/panels";
import { ProductPicker } from "@/components/pdp/product-picker";
import { StudioFileControls } from "@/components/pdp/studio-file-controls";
import { ViewportControls } from "@/components/pdp/viewport-controls";
import { useMcatConfig } from "@/hooks/use-mcat-config";
import { usePdpStudio } from "@/hooks/use-pdp-studio";
import { CONCEPTS } from "@/lib/pdp/concepts";
import { EMPTY_PRODUCT } from "@/lib/pdp/demo-data";
import { getMcatRanking, levelText } from "@/lib/pdp/mcat-config";
import type { McatConfigCache, McatConfigRemote } from "@/lib/pdp/mcat-config-store";
import { parsePdpContext } from "@/lib/pdp/schema";
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
}

export function PdpStudio({ mcatStorage }: PdpStudioProps = {}) {
  const { state, dispatch, revision, saveStatus, loadWarning, importText, reset } = usePdpStudio();
  const { mcat, mcatId, contextJson, products, device, fold, snapshot, preferredId } = state;
  const mcatConfig = useMcatConfig(mcatStorage);
  const activeConfig = mcatConfig.active;

  const [tab, setTab] = useState("concepts");

  const liveCtx = useMemo(() => parsePdpContext(contextJson), [contextJson]);
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

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl flex-col gap-1.5 px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">All sample content is demo data</Badge>
            <Badge variant="outline">Runs locally · no sign-in, no database</Badge>
          </div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
            IndiaMART PDP UI Generator
          </h1>
          <p className="text-sm text-muted-foreground">
            Design product detail page layouts for IndiaMART-style listings. Everything you see is
            for layout design only.
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
                  placeholder="e.g. Water Bottles"
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

            <p className="text-xs text-muted-foreground">
              Edit the five products in the <span className="font-medium">Product Cards</span> tab
              and the seller and category details in the{" "}
              <span className="font-medium">JSON Context</span> tab below.
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

            <Button
              size="lg"
              className="w-full sm:w-auto"
              onClick={() => dispatch({ type: "generate" })}
            >
              <Sparkles className="size-4" />
              Generate 5 Concepts
            </Button>
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
                <div className="grid gap-4 xl:grid-cols-2">
                  {CONCEPTS.map((concept, index) => {
                    const product =
                      snapshot.products[state.previewProductIndex] ??
                      snapshot.products[0] ??
                      EMPTY_PRODUCT;
                    return (
                      <Card key={concept.id} className="min-w-0">
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <CardTitle className="text-base">
                                {index + 1}. {concept.name}
                              </CardTitle>
                              <CardDescription>{concept.tagline}</CardDescription>
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
                            viewport={state.viewports[device]}
                            mcatRanking={snapshotRanking}
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
              <Badge variant="secondary">Demo data</Badge>
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
            />
          </TabsContent>

          <TabsContent value="recommendation" className="mt-4">
            <RecommendationPanel
              concepts={CONCEPTS}
              preferredId={preferredId}
              onPick={(id) => dispatch({ type: "setPreferred", id })}
            />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
