import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { Monitor, RefreshCw, Smartphone, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ConceptPreview } from "@/components/pdp/concept-preview";
import { ImageUrlField } from "@/components/pdp/image-url-field";
import { BenchmarkPanel, RecommendationPanel, SourcesPanel } from "@/components/pdp/panels";
import { CONCEPTS } from "@/lib/pdp/concepts";
import {
  DEFAULT_CONTEXT_JSON,
  DEFAULT_MCAT,
  DEMO_PRODUCTS,
  EMPTY_PRODUCT,
  parsePdpContext,
} from "@/lib/pdp/demo-data";
import type { DeviceMode, FoldMode, PdpContext, Product } from "@/lib/pdp/types";

interface Snapshot {
  mcat: string;
  products: Product[];
  ctx: PdpContext;
}

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

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "IndiaMART PDP UI Generator" },
      {
        name: "description",
        content:
          "Design and preview five IndiaMART-style product detail page concepts from your MCAT, product and JSON inputs. Demo data only.",
      },
      { property: "og:title", content: "IndiaMART PDP UI Generator" },
      {
        property: "og:description",
        content:
          "Generate five distinct PDP layout concepts with mobile, desktop and first-fold previews.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const [mcat, setMcat] = useState(DEFAULT_MCAT);
  const [contextJson, setContextJson] = useState(DEFAULT_CONTEXT_JSON);
  const [products, setProducts] = useState<Product[]>(DEMO_PRODUCTS);
  const [device, setDevice] = useState<DeviceMode>("mobile");
  const [fold, setFold] = useState<FoldMode>("first");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [preferredId, setPreferredId] = useState<string | null>(null);
  const [benchmarkNotes, setBenchmarkNotes] = useState("");

  const liveCtx = useMemo(() => parsePdpContext(contextJson), [contextJson]);

  const updateProduct = (id: string, patch: Partial<Product>) => {
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  const generate = () => {
    setSnapshot({
      mcat: mcat.trim() || DEFAULT_MCAT,
      products,
      ctx: liveCtx,
    });
    setPreferredId(null);
  };

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
        <Card>
          <CardHeader>
            <CardTitle>Step 1 — Brief</CardTitle>
            <CardDescription>
              Fill the MCAT name, JSON context and five product cards, then generate five layout
              concepts.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="mcat">MCAT name</Label>
                <Input
                  id="mcat"
                  value={mcat}
                  onChange={(event) => setMcat(event.target.value)}
                  placeholder="e.g. Water Bottles"
                />
              </div>
              <Segmented
                label="Preview device"
                value={device}
                onChange={setDevice}
                options={[
                  { value: "mobile", label: "Mobile", icon: <Smartphone className="size-3.5" /> },
                  { value: "desktop", label: "Desktop", icon: <Monitor className="size-3.5" /> },
                ]}
              />
              <Segmented
                label="Page view"
                value={fold}
                onChange={setFold}
                options={[
                  { value: "first", label: "First Fold", icon: null },
                  { value: "full", label: "Full PDP", icon: null },
                ]}
              />
            </div>

            <div className="space-y-1.5">
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
              <Textarea
                id="context-json"
                rows={8}
                className="font-mono text-xs"
                value={contextJson}
                onChange={(event) => setContextJson(event.target.value)}
              />
              {!liveCtx.ok && (
                <ul className="list-inside list-disc text-xs text-destructive">
                  {liveCtx.issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Product cards (five)</Label>
                <Badge variant="secondary">Demo data</Badge>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {products.map((product, index) => (
                  <Card key={product.id} className="bg-muted/30">
                    <CardContent className="space-y-2.5 pt-5">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Product {index + 1} · demo
                      </p>
                      <Input
                        value={product.name}
                        onChange={(e) => updateProduct(product.id, { name: e.target.value })}
                        placeholder="Product name"
                        aria-label={`Product ${index + 1} name`}
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          value={product.price}
                          onChange={(e) => updateProduct(product.id, { price: e.target.value })}
                          placeholder="Price ₹"
                          aria-label={`Product ${index + 1} price`}
                        />
                        <Input
                          value={product.priceMax}
                          onChange={(e) => updateProduct(product.id, { priceMax: e.target.value })}
                          placeholder="Max price ₹ (optional)"
                          aria-label={`Product ${index + 1} maximum price`}
                        />
                        <Input
                          value={product.unit}
                          onChange={(e) => updateProduct(product.id, { unit: e.target.value })}
                          placeholder="Unit, e.g. piece"
                          aria-label={`Product ${index + 1} unit`}
                        />
                        <Input
                          value={product.moq}
                          onChange={(e) => updateProduct(product.id, { moq: e.target.value })}
                          placeholder="MOQ"
                          aria-label={`Product ${index + 1} MOQ`}
                        />
                      </div>
                      <Textarea
                        rows={2}
                        value={product.highlights}
                        onChange={(e) => updateProduct(product.id, { highlights: e.target.value })}
                        placeholder="Highlights, comma separated"
                        aria-label={`Product ${index + 1} highlights`}
                      />
                      <Textarea
                        rows={3}
                        className="font-mono text-xs"
                        value={product.specs}
                        onChange={(e) => updateProduct(product.id, { specs: e.target.value })}
                        placeholder={"ISQ / specs, one per line:\nMaterial: Steel"}
                        aria-label={`Product ${index + 1} specs`}
                      />
                      <Textarea
                        rows={2}
                        value={product.description}
                        onChange={(e) => updateProduct(product.id, { description: e.target.value })}
                        placeholder="Short description"
                        aria-label={`Product ${index + 1} description`}
                      />
                      <ImageUrlField
                        urls={product.imageUrls}
                        onChange={(imageUrls) => updateProduct(product.id, { imageUrls })}
                        label={`Product ${index + 1} image URLs`}
                      />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            <Button size="lg" className="w-full sm:w-auto" onClick={generate}>
              <Sparkles className="size-4" />
              Generate 5 Concepts
            </Button>
          </CardContent>
        </Card>

        <Tabs defaultValue="concepts">
          <TabsList className="h-auto flex-wrap">
            <TabsTrigger value="concepts">Five Concepts</TabsTrigger>
            <TabsTrigger value="benchmark">Benchmark Comparison</TabsTrigger>
            <TabsTrigger value="sources">Sources</TabsTrigger>
            <TabsTrigger value="recommendation">Final Recommendation</TabsTrigger>
          </TabsList>

          <TabsContent value="concepts" className="mt-4 space-y-4">
            {!snapshot ? (
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  No concepts yet — fill the brief above and press &quot;Generate 5 Concepts&quot;.
                </CardContent>
              </Card>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Concept {1} previews Product {1} (demo)… concept {CONCEPTS.length} previews
                  Product {CONCEPTS.length} (demo). Edit inputs and press Generate again to refresh
                  previews.
                </p>
                <div className="grid gap-4 xl:grid-cols-2">
                  {CONCEPTS.map((concept, index) => {
                    const product =
                      snapshot.products[index] ?? snapshot.products[0] ?? EMPTY_PRODUCT;
                    return (
                      <Card key={concept.id}>
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
                              onClick={() => setPreferredId(concept.id)}
                            >
                              {preferredId === concept.id ? "Preferred" : "Mark preferred"}
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <ConceptPreview
                            concept={concept}
                            product={product}
                            ctx={snapshot.ctx}
                            mcat={snapshot.mcat}
                            device={device}
                            fold={fold}
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

          <TabsContent value="benchmark" className="mt-4">
            <BenchmarkPanel value={benchmarkNotes} onChange={setBenchmarkNotes} />
          </TabsContent>

          <TabsContent value="sources" className="mt-4">
            {snapshot ? (
              <SourcesPanel
                mcat={snapshot.mcat}
                products={snapshot.products}
                ctx={snapshot.ctx}
                contextJson={contextJson}
              />
            ) : (
              <SourcesPanel
                mcat={mcat}
                products={products}
                ctx={liveCtx}
                contextJson={contextJson}
              />
            )}
          </TabsContent>

          <TabsContent value="recommendation" className="mt-4">
            <RecommendationPanel
              concepts={CONCEPTS}
              preferredId={preferredId}
              onPick={setPreferredId}
            />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
