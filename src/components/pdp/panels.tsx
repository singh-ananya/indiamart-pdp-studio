import { Info, ListChecks, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import type { Concept, PdpContext, Product } from "@/lib/pdp/types";

interface BenchmarkPanelProps {
  /** Notes are owned by the page so they survive Radix Tabs unmounting this panel. */
  value: string;
  onChange: (value: string) => void;
}

export function BenchmarkPanel({ value: text, onChange: setText }: BenchmarkPanelProps) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    <div className="space-y-4">
      <div className="flex gap-3 rounded-lg border border-amber-500/40 bg-accent p-4">
        <Info className="mt-0.5 size-4 shrink-0 text-brand-orange" />
        <div className="space-y-1 text-sm">
          <p className="font-medium">No benchmark sources are fetched or invented.</p>
          <p className="text-muted-foreground">
            This tool does not research competitors or marketplaces. Paste benchmark notes you
            already have (for example from your own account manager or marketplace reporting) and
            they will be listed below as you wrote them.
          </p>
        </div>
      </div>
      <Textarea
        rows={6}
        placeholder={
          "One benchmark note per line, e.g.\nCompetitor A: faster CTA above fold\nCompetitor B: larger gallery"
        }
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      {lines.length > 0 ? (
        <Card>
          <CardContent className="pt-6">
            <ol className="space-y-2">
              {lines.map((line, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <span className="font-semibold text-brand-orange">{i + 1}.</span>
                  <span>{line}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">
          Nothing pasted yet — the comparison table stays empty on purpose rather than showing
          made-up benchmarks.
        </p>
      )}
    </div>
  );
}

interface SourcesPanelProps {
  mcat: string;
  products: Product[];
  ctx: PdpContext;
  contextJson: string;
  mcatId?: string;
  /** Active MCAT configuration file; null when none is loaded. */
  mcatConfig?: { fileName: string; version: string; uploadedAt: string } | null;
}

export function SourcesPanel({
  mcat,
  products,
  ctx,
  contextJson,
  mcatId = "",
  mcatConfig = null,
}: SourcesPanelProps) {
  const usedKeys = (() => {
    try {
      const raw = JSON.parse(contextJson) as unknown;
      if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return [];
      return Object.keys(raw).filter((key) => !ctx.ignoredKeys.includes(key));
    } catch {
      return [];
    }
  })();

  return (
    <div className="space-y-4">
      <div className="flex gap-3 rounded-lg border border-amber-500/40 bg-accent p-4">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-brand-orange" />
        <div className="space-y-1 text-sm">
          <p className="font-medium">No external research was performed.</p>
          <p className="text-muted-foreground">
            Concepts are generated locally from the inputs below only, including the MCAT
            configuration file you imported. No web search, external API, or benchmark data feeds
            this tool.
          </p>
        </div>
      </div>
      <Card>
        <CardContent className="space-y-4 pt-6 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              MCAT name
            </p>
            <p>{mcat}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              MCAT configuration
            </p>
            {mcatConfig ? (
              <p>
                {mcatConfig.fileName}
                {mcatConfig.version && `, version ${mcatConfig.version}`} (shared in Supabase,
                uploaded {mcatConfig.uploadedAt}) · MCAT ID {mcatId || "not set"}
              </p>
            ) : (
              <p className="text-muted-foreground">No MCAT configuration loaded.</p>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Product cards ({products.length})
            </p>
            <ul className="mt-1 list-inside list-disc space-y-1">
              {products.map((p) => (
                <li key={p.id}>{p.name}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              JSON context
            </p>
            <p className="mt-1 flex flex-wrap gap-1.5">
              {ctx.ok && usedKeys.length > 0 ? (
                usedKeys.map((key) => (
                  <Badge key={key} variant="secondary">
                    {key}
                  </Badge>
                ))
              ) : (
                <span className="text-muted-foreground">No context fields used.</span>
              )}
            </p>
            {ctx.ignoredKeys.length > 0 && (
              <p className="mt-2 text-muted-foreground">
                Ignored (not used by the generator): {ctx.ignoredKeys.join(", ")}
              </p>
            )}
            {ctx.ok ? (
              <p className="mt-2 text-muted-foreground">
                Status: valid · brand &quot;{ctx.brand || "—"}&quot;, city &quot;
                {ctx.city || "—"}&quot;.
              </p>
            ) : (
              <p className="mt-2 text-destructive">
                Status: not used — {ctx.issues.join("; ")}. Previews fall back to product card data.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface RecommendationPanelProps {
  concepts: Concept[];
  preferredId: string | null;
  onPick: (id: string) => void;
}

export function RecommendationPanel({ concepts, preferredId, onPick }: RecommendationPanelProps) {
  const preferred = concepts.find((c) => c.id === preferredId) ?? null;

  return (
    <div className="space-y-4">
      {!preferred ? (
        <div className="flex gap-3 rounded-lg border border-amber-500/40 bg-accent p-4">
          <ListChecks className="mt-0.5 size-4 shrink-0 text-brand-orange" />
          <div className="space-y-1 text-sm">
            <p className="font-medium">No concept selected yet.</p>
            <p className="text-muted-foreground">
              Mark the concept you prefer in the Five Concepts tab. Your choice appears here with
              its design intent — the tool does not score concepts for you.
            </p>
          </div>
        </div>
      ) : (
        <Card className="border-primary/50">
          <CardContent className="space-y-2 pt-6">
            <Badge>Preferred concept</Badge>
            <h3 className="text-lg font-semibold">{preferred.name}</h3>
            <p className="text-sm text-muted-foreground">{preferred.tagline}</p>
            <p className="text-sm">
              <span className="font-medium">Best for:</span> {preferred.bestFor}
            </p>
            <p className="text-xs text-muted-foreground">
              First fold: {preferred.firstFold.join(" → ")}
            </p>
            <p className="text-xs text-muted-foreground">
              This recommendation reflects your own selection. Validate with real buyer data before
              rolling out.
            </p>
          </CardContent>
        </Card>
      )}
      <div className="space-y-2">
        <p className="text-sm font-medium">Switch preference:</p>
        <div className="flex flex-wrap gap-2">
          {concepts.map((c) => (
            <Button
              key={c.id}
              variant={c.id === preferredId ? "default" : "outline"}
              size="sm"
              onClick={() => onPick(c.id)}
            >
              {c.name}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
