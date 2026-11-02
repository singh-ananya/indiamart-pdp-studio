import { ExternalLink, Globe } from "lucide-react";
import { inspectedEntries, type BenchmarkFile } from "@/lib/pdp/benchmark";

/**
 * Which external websites the designs were benchmarked against, from the saved
 * research for this MCAT. Only inspected pages are listed as sources; pages that
 * could not be opened are counted, not linked as sources.
 */
export function BenchmarkedSites({ benchmark }: { benchmark: BenchmarkFile | null }) {
  const inspected = inspectedEntries(benchmark);
  if (!benchmark || inspected.length === 0) {
    return (
      <div aria-label="Benchmarked websites" className="rounded-md border px-3 py-2 text-sm">
        <p className="text-muted-foreground">
          No benchmark research for this MCAT yet, so the designs use only the MCAT ranking and your
          product data. Run it in the <span className="font-medium">Benchmark Comparison</span> tab,
          then generate again.
        </p>
      </div>
    );
  }
  const notInspected = benchmark.entries.length - inspected.length;
  return (
    <div
      aria-label="Benchmarked websites"
      className="space-y-2 rounded-md border px-3 py-2 text-sm"
    >
      <p className="flex flex-wrap items-center gap-1.5">
        <Globe className="size-4 text-brand-orange" />
        <span className="font-medium">
          Benchmarked against {inspected.length} product page(s) on other websites
        </span>
        <span className="text-xs text-muted-foreground">
          · {benchmark.mcat.name}, researched {benchmark.researchedAt}
          {notInspected > 0 && ` · ${notInspected} more could not be opened`}
        </span>
      </p>
      <ul className="flex flex-wrap gap-1.5">
        {inspected.map((entry) => (
          <li key={entry.url}>
            <a
              href={entry.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2.5 py-1 text-xs hover:bg-muted"
              title={entry.url}
            >
              {entry.site}{" "}
              <span className="text-muted-foreground">
                · {entry.type === "b2b" ? "B2B" : "E-commerce"}
              </span>
              <ExternalLink className="size-3" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
