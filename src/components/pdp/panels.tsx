import { useRef, useState } from "react";
import { ExternalLink, Info, ListChecks, Search, TriangleAlert, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import type { BenchmarkImportResult } from "@/hooks/use-benchmarks";
import type { ResearchProgress } from "@/lib/ai/research";
import { BENCHMARK_PATTERNS, countPatterns, inspectedEntries } from "@/lib/pdp/benchmark";
import type { StoredBenchmark } from "@/lib/pdp/benchmark-store";
import { effectiveWeights, type ConceptScore, type CriterionScore } from "@/lib/pdp/scoring";
import type { Concept, PdpContext, Product } from "@/lib/pdp/types";

type Message = { kind: "error" | "success"; title: string; lines: string[] } | null;

/** FileReader works in older mobile browsers that lack Blob.text(). */
function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file"));
    reader.readAsText(file);
  });
}

function Notice({ message }: { message: NonNullable<Message> }) {
  return (
    <div
      role={message.kind === "error" ? "alert" : "status"}
      className={
        message.kind === "error"
          ? "rounded-md border border-destructive/50 px-3 py-2 text-xs text-destructive"
          : "rounded-md border px-3 py-2 text-xs"
      }
    >
      <p className="font-medium">{message.title}</p>
      {message.lines.length > 0 && (
        <ul className="mt-1 list-inside list-disc">
          {message.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SourceLink({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex max-w-full items-center gap-1 break-all text-primary underline underline-offset-2"
    >
      {url}
      <ExternalLink className="size-3 shrink-0" />
    </a>
  );
}

const SectionLabel = ({ children }: { children: string }) => (
  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{children}</p>
);

// ---------------------------------------------------------------------------
// Benchmark
// ---------------------------------------------------------------------------

interface BenchmarkPanelProps {
  /** Notes are owned by the page so they survive Radix Tabs unmounting this panel. */
  value: string;
  onChange: (value: string) => void;
  /** Research set for the generated MCAT; null when none matches. */
  benchmark?: StoredBenchmark | null;
  /** Every stored set (newest per MCAT), to show what exists for other MCATs. */
  allSets?: StoredBenchmark[];
  mcatLabel?: string;
  /** Signed in with a permitted account; importing needs it. */
  canImport?: boolean;
  loadErrors?: string[];
  onImport?: (text: string) => Promise<BenchmarkImportResult>;
  /** Point the brief at a saved result's MCAT so the concepts use it. */
  onUseMcat?: (name: string, id: string) => void;
  /** In-app research with the user's AI key; omitted when not available at all. */
  research?: ResearchControl | undefined;
}

export interface ResearchControl {
  /** Why research cannot run right now; null when it can. */
  blockedReason: string | null;
  /** What will be researched, e.g. "32 inch LED TV (MCAT 650708) + 5 product names". */
  target: string;
  run: (
    onProgress: (p: ResearchProgress) => void,
    signal: AbortSignal,
  ) => Promise<{ saved: true; summary: string[] } | { saved: false; errors: string[] }>;
}

function progressText(p: ResearchProgress | null): string {
  if (!p) return "";
  if (p.stage === "searching") return `Searching the web (${p.done + 1} of ${p.total})…`;
  if (p.stage === "reading") return `Reading page ${p.done + 1} of ${p.total}…`;
  return "Saving…";
}

function ResearchRunner({ research }: { research: ResearchControl }) {
  const [progress, setProgress] = useState<ResearchProgress | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const controller = useRef<AbortController | null>(null);
  const running = progress !== null;

  const start = async () => {
    const abort = new AbortController();
    controller.current = abort;
    setMessage(null);
    setProgress({ stage: "searching", done: 0, total: 1 });
    try {
      const result = await research.run(setProgress, abort.signal);
      setMessage(
        result.saved
          ? { kind: "success", title: "Research saved to Saved research", lines: result.summary }
          : {
              kind: "error",
              title: "Research was not saved — nothing changed",
              lines: result.errors,
            },
      );
    } finally {
      setProgress(null);
      controller.current = null;
    }
  };

  return (
    <section className="space-y-2 rounded-lg border p-4" aria-label="Benchmark research">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Research with your AI key</p>
          <p className="text-xs text-muted-foreground">
            Searches the web for {research.target}, reads up to 20 non-IndiaMART product pages and
            keeps only findings whose quotes appear on the page. Uses your OpenRouter credit.
          </p>
        </div>
        <div className="flex gap-2">
          {running && (
            <Button variant="ghost" size="sm" onClick={() => controller.current?.abort()}>
              Cancel
            </Button>
          )}
          <Button
            size="sm"
            disabled={running || research.blockedReason !== null}
            onClick={() => void start()}
          >
            <Search className="size-3.5" />
            {running ? "Researching…" : "Run benchmark research"}
          </Button>
        </div>
      </div>
      {research.blockedReason && !running && (
        <p className="text-xs text-muted-foreground">{research.blockedReason}</p>
      )}
      {running && (
        <p role="status" className="text-xs">
          {progressText(progress)}
        </p>
      )}
      {message && <Notice message={message} />}
    </section>
  );
}

export function BenchmarkPanel({
  value: text,
  onChange: setText,
  benchmark = null,
  allSets = [],
  mcatLabel = "",
  canImport = false,
  loadErrors = [],
  onImport,
  onUseMcat,
  research,
}: BenchmarkPanelProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<Message>(null);
  const [busy, setBusy] = useState(false);
  // A saved result the user chose to view; otherwise the one for the brief's MCAT.
  const [viewId, setViewId] = useState<number | null>(null);
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const shown = (viewId !== null ? allSets.find((s) => s.id === viewId) : null) ?? benchmark;
  const viewingOther = shown !== null && shown.id !== benchmark?.id;
  const file = shown?.file ?? null;
  const inspected = inspectedEntries(file);
  const patterns = countPatterns(file);

  const handleFile = async (picked: File | undefined) => {
    if (!picked || !onImport) return;
    setBusy(true);
    try {
      const result = await onImport(await readFileText(picked));
      setMessage(
        result.ok
          ? {
              kind: "success",
              title: `Imported ${picked.name} for ${result.set.file.mcat.name}`,
              lines: result.warnings,
            }
          : {
              kind: "error",
              title: `${picked.name} was not imported — nothing changed`,
              lines: result.errors,
            },
      );
    } catch (error) {
      setMessage({
        kind: "error",
        title: `${picked.name} could not be read — nothing changed`,
        lines: [error instanceof Error ? error.message : "Unknown read error"],
      });
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-3 rounded-lg border border-amber-500/40 bg-accent p-4">
        <Info className="mt-0.5 size-4 shrink-0 text-brand-orange" />
        <div className="space-y-1 text-sm">
          <p className="font-medium">The app does not research or invent benchmarks.</p>
          <p className="text-muted-foreground">
            Results come only from an imported research file. Every inspected page lists what was
            observed with its evidence and source link; pages that could not be opened are shown as
            such and are not scored.
          </p>
        </div>
      </div>

      {research && <ResearchRunner research={research} />}

      {onImport && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            aria-label="Benchmark research JSON file"
            onChange={(event) => void handleFile(event.target.files?.[0])}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={!canImport || busy}
            onClick={() => fileInput.current?.click()}
          >
            <Upload className="size-3.5" />
            {busy ? "Importing…" : "Import benchmark JSON"}
          </Button>
          {!canImport && (
            <span className="text-xs text-muted-foreground">
              Sign in (MCAT configuration card) to import or view shared research.
            </span>
          )}
        </div>
      )}
      {message && <Notice message={message} />}
      {loadErrors.length > 0 && (
        <Notice message={{ kind: "error", title: loadErrors[0]!, lines: loadErrors.slice(1) }} />
      )}

      {allSets.length > 0 && (
        <section className="space-y-2" aria-label="Saved research">
          <p className="text-sm font-medium">
            Saved research ({allSets.length}) — shared with everyone who signs in, no AI key needed
          </p>
          <ul className="space-y-2">
            {allSets.map((set) => {
              const inspectedCount = inspectedEntries(set.file).length;
              const active = shown?.id === set.id;
              return (
                <li
                  key={set.id}
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm ${active ? "border-primary/60 bg-muted/40" : ""}`}
                >
                  <div className="min-w-0">
                    <p className="font-medium">
                      {set.file.mcat.name}
                      {set.file.mcat.id && ` (MCAT ${set.file.mcat.id})`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Researched {set.file.researchedAt} · {inspectedCount} of{" "}
                      {set.file.entries.length} pages inspected · saved by {set.uploadedBy}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant={active ? "default" : "outline"}
                    aria-pressed={active}
                    aria-label={`View saved research for ${set.file.mcat.name}`}
                    onClick={() => setViewId(set.id)}
                  >
                    {active ? "Viewing" : "View"}
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {viewingOther && shown && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-xs">
          <span>
            Viewing saved research for {shown.file.mcat.name}. The concepts use research for the
            brief&apos;s MCAT ({mcatLabel || "not set"}).
          </span>
          {onUseMcat && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                onUseMcat(shown.file.mcat.name, shown.file.mcat.id);
                setViewId(null);
              }}
            >
              Use this MCAT in the brief
            </Button>
          )}
        </div>
      )}

      {file ? (
        <div className="space-y-4" aria-label="Benchmark results">
          <Card>
            <CardContent className="space-y-2 pt-5 text-sm">
              <p className="font-medium">
                {file.mcat.name}
                {file.mcat.id && ` (MCAT ${file.mcat.id})`} — researched {file.researchedAt}
              </p>
              <p className="text-muted-foreground">
                {file.entries.length} pages listed · {inspected.length} inspected ·{" "}
                {file.entries.length - inspected.length} could not be inspected
              </p>
              {patterns.length > 0 && (
                <div>
                  <SectionLabel>Observed patterns (inspected pages)</SectionLabel>
                  <ul className="mt-1 space-y-0.5">
                    {patterns.map(({ pattern, pages }) => (
                      <li key={pattern}>
                        {BENCHMARK_PATTERNS[pattern].label}:{" "}
                        <span className="font-medium">
                          {pages} of {inspected.length}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
          <ol className="space-y-3">
            {file.entries.map((entry, i) => (
              <li key={entry.url}>
                <Card>
                  <CardContent className="space-y-2 pt-5 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-brand-orange">{i + 1}.</span>
                      <span className="font-medium">{entry.site}</span>
                      <Badge variant="outline">
                        {entry.type === "b2b"
                          ? "B2B"
                          : entry.type === "ecommerce"
                            ? "E-commerce"
                            : "Type not determined"}
                      </Badge>
                      {entry.status === "inspected" ? (
                        <Badge variant="secondary">Inspected {entry.inspectedAt}</Badge>
                      ) : (
                        <Badge variant="destructive">Could not be inspected</Badge>
                      )}
                    </div>
                    <SourceLink url={entry.url} />
                    {entry.status === "inspected" ? (
                      <>
                        <div>
                          <SectionLabel>Observed UI patterns</SectionLabel>
                          <ul className="mt-1 space-y-1">
                            {entry.observations.map((o, j) => (
                              <li key={j}>
                                <span className="font-medium">
                                  {o.pattern === "other"
                                    ? "Other"
                                    : BENCHMARK_PATTERNS[o.pattern].label}
                                </span>
                                : {o.note}
                                <details className="text-xs text-muted-foreground">
                                  <summary className="cursor-pointer">Evidence</summary>
                                  <p className="mt-0.5 whitespace-pre-wrap">{o.evidence}</p>
                                </details>
                              </li>
                            ))}
                          </ul>
                        </div>
                        {entry.strengths.length > 0 && (
                          <div>
                            <SectionLabel>Strengths</SectionLabel>
                            <ul className="mt-1 list-inside list-disc">
                              {entry.strengths.map((s) => (
                                <li key={s}>{s}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        <div>
                          <SectionLabel>Applicability to IndiaMART</SectionLabel>
                          <p className="mt-1">{entry.applicability}</p>
                        </div>
                      </>
                    ) : (
                      <p className="text-muted-foreground">Reason: {entry.reason}</p>
                    )}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No benchmark research imported for {mcatLabel || "this MCAT"}.
          {allSets.length > 0 && " Open one of the saved results above, or import research for it."}
        </p>
      )}

      <div className="space-y-2">
        <p className="text-sm font-medium">Your own notes</p>
        <Textarea
          rows={4}
          placeholder={
            "One benchmark note per line, e.g.\nCompetitor A: faster CTA above fold\nCompetitor B: larger gallery"
          }
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        {lines.length > 0 && (
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
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

interface SourcesPanelProps {
  mcat: string;
  products: Product[];
  ctx: PdpContext;
  contextJson: string;
  mcatId?: string;
  /** Active MCAT configuration file; null when none is loaded. */
  mcatConfig?: { fileName: string; version: string; uploadedAt: string } | null;
  benchmark?: StoredBenchmark | null;
}

export function SourcesPanel({
  mcat,
  products,
  ctx,
  contextJson,
  mcatId = "",
  mcatConfig = null,
  benchmark = null,
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
  const file = benchmark?.file ?? null;

  return (
    <div className="space-y-4">
      <div className="flex gap-3 rounded-lg border border-amber-500/40 bg-accent p-4">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-brand-orange" />
        <div className="space-y-1 text-sm">
          <p className="font-medium">Everything shown comes from the sources below.</p>
          <p className="text-muted-foreground">
            The app itself does no web search and calls no external research API. Concepts use your
            inputs, the MCAT configuration and the imported benchmark research only.
          </p>
        </div>
      </div>
      <Card>
        <CardContent className="space-y-4 pt-6 text-sm">
          <div>
            <SectionLabel>MCAT name</SectionLabel>
            <p>{mcat}</p>
          </div>
          <div>
            <SectionLabel>MCAT configuration</SectionLabel>
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
            <SectionLabel>Benchmark research</SectionLabel>
            {file ? (
              <div className="mt-1 space-y-2">
                <p>
                  {file.mcat.name}, researched {file.researchedAt}; imported {benchmark!.uploadedAt}{" "}
                  by {benchmark!.uploadedBy}.
                </p>
                <p className="text-muted-foreground">Method: {file.method}</p>
                <ol className="list-inside list-decimal space-y-1" aria-label="Benchmark sources">
                  {file.entries.map((entry) => (
                    <li key={entry.url}>
                      {entry.site} —{" "}
                      {entry.status === "inspected"
                        ? `inspected ${entry.inspectedAt}`
                        : `not inspected (${entry.reason})`}
                      <div className="pl-5">
                        <SourceLink url={entry.url} />
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            ) : (
              <p className="text-muted-foreground">No benchmark research imported for this MCAT.</p>
            )}
          </div>
          <div>
            <SectionLabel>{`Product cards (${products.length})`}</SectionLabel>
            <ul className="mt-1 list-inside list-disc space-y-1">
              {products.map((p) => (
                <li key={p.id}>{p.name || "(empty)"}</li>
              ))}
            </ul>
          </div>
          <div>
            <SectionLabel>JSON context</SectionLabel>
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

// ---------------------------------------------------------------------------
// Recommendation
// ---------------------------------------------------------------------------

interface RecommendationPanelProps {
  concepts: Concept[];
  preferredId: string | null;
  onPick: (id: string) => void;
  /** One score per concept once all five are measured; null before that. */
  scores?: ConceptScore[] | null;
  /** What the scores were measured on, e.g. "Product 1 on mobile 360 × 640". */
  scoreBasis?: string;
}

function tradeOff(score: ConceptScore): {
  best: CriterionScore | null;
  worst: CriterionScore | null;
} {
  const scored = score.criteria.filter((c) => c.score !== null);
  if (scored.length === 0) return { best: null, worst: null };
  const sorted = [...scored].sort((a, b) => b.score! - a.score!);
  return { best: sorted[0]!, worst: sorted[sorted.length - 1]! };
}

export function RecommendationPanel({
  concepts,
  preferredId,
  onPick,
  scores = null,
  scoreBasis = "",
}: RecommendationPanelProps) {
  const preferred = concepts.find((c) => c.id === preferredId) ?? null;
  const byId = new Map(concepts.map((c) => [c.id, c]));

  return (
    <div className="space-y-4">
      {!scores ? (
        <div className="flex gap-3 rounded-lg border border-amber-500/40 bg-accent p-4">
          <ListChecks className="mt-0.5 size-4 shrink-0 text-brand-orange" />
          <div className="space-y-1 text-sm">
            <p className="font-medium">No ranking yet.</p>
            <p className="text-muted-foreground">
              Press &quot;Generate 5 AI Designs&quot;. Scores are calculated from the measured
              previews in the Five Concepts tab.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3" aria-label="Concept ranking">
          <p className="text-sm text-muted-foreground">
            Ranked by a weighted score{scoreBasis && ` measured on ${scoreBasis}`}. Weights: MCAT
            priorities 35, benchmark patterns 25, planned fold fits 20, real data above the fold 20.
            A criterion with no input is left out and the others are rescaled, as shown.
          </p>
          <ol className="space-y-3">
            {scores.map((score, i) => {
              const concept = byId.get(score.conceptId);
              if (!concept) return null;
              const weights = effectiveWeights(score);
              const { best, worst } = tradeOff(score);
              return (
                <li key={score.conceptId}>
                  <Card className={i === 0 ? "border-primary/60" : undefined}>
                    <CardContent className="space-y-2 pt-5 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold">
                          #{i + 1} {concept.name}
                        </p>
                        <Badge variant={i === 0 ? "default" : "secondary"}>
                          {score.total} / 100
                        </Badge>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="text-left text-muted-foreground">
                            <tr>
                              <th className="py-1 pr-2 font-medium">Criterion</th>
                              <th className="py-1 pr-2 font-medium">Weight</th>
                              <th className="py-1 pr-2 font-medium">Score</th>
                              <th className="py-1 font-medium">Why</th>
                            </tr>
                          </thead>
                          <tbody>
                            {score.criteria.map((c) => (
                              <tr key={c.key} className="border-t align-top">
                                <td className="py-1 pr-2">{c.label}</td>
                                <td className="py-1 pr-2">
                                  {c.score === null ? "—" : `${weights[c.key]}%`}
                                </td>
                                <td className="py-1 pr-2">{c.score === null ? "n/a" : c.score}</td>
                                <td className="py-1">{c.detail}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {best && worst && best.key !== worst.key && (
                        <p className="text-xs">
                          <span className="font-medium">Trade-off:</span> strongest on{" "}
                          {best.label.toLowerCase()} ({best.score}), weakest on{" "}
                          {worst.label.toLowerCase()} ({worst.score}).
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ol>
          <p className="text-xs text-muted-foreground">
            Scores describe this layout with this data on this screen size. Validate with real buyer
            data before rolling out.
          </p>
        </div>
      )}

      {preferred && (
        <Card className="border-primary/50">
          <CardContent className="space-y-2 pt-6">
            <Badge>Your preferred concept</Badge>
            <h3 className="text-lg font-semibold">{preferred.name}</h3>
            <p className="text-sm text-muted-foreground">{preferred.tagline}</p>
            <p className="text-xs text-muted-foreground">
              First fold: {preferred.firstFold.join(" → ")}
            </p>
          </CardContent>
        </Card>
      )}
      <div className="space-y-2">
        <p className="text-sm font-medium">
          {preferred ? "Switch preference:" : "Mark your preference:"}
        </p>
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
