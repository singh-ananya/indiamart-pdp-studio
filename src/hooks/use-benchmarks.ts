import { useCallback, useEffect, useState } from "react";
import { parseBenchmarkText } from "@/lib/pdp/benchmark";
import {
  createSupabaseBenchmarkRemote,
  type BenchmarkRemote,
  type StoredBenchmark,
} from "@/lib/pdp/benchmark-store";

export type BenchmarkImportResult =
  { ok: true; set: StoredBenchmark; warnings: string[] } | { ok: false; errors: string[] };

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Shared benchmark research sets (newest per MCAT). Loaded once a permitted user is
 * signed in. An import is fully validated before it is stored; a failure changes nothing.
 */
export function useBenchmarks(signedIn: boolean, remote?: BenchmarkRemote) {
  const [store] = useState(() => remote ?? createSupabaseBenchmarkRemote());
  const [sets, setSets] = useState<StoredBenchmark[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!store.configured || !signedIn) {
      setSets([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    store
      .listLatest()
      .then(({ sets: loaded, skipped }) => {
        if (cancelled) return;
        setSets(loaded);
        setErrors(skipped);
      })
      .catch((error: unknown) => {
        if (!cancelled) setErrors([`Could not load benchmark research: ${message(error)}`]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [store, signedIn]);

  const importText = useCallback(
    async (text: string): Promise<BenchmarkImportResult> => {
      const parsed = parseBenchmarkText(text);
      if (!parsed.ok) return parsed;
      let stored: StoredBenchmark;
      try {
        stored = await store.upload(parsed.file);
      } catch (error) {
        return { ok: false, errors: [`Could not save it: ${message(error)}`] };
      }
      const key = (s: StoredBenchmark) => s.file.mcat.id || s.file.mcat.name.trim().toLowerCase();
      setSets((prev) => [stored, ...prev.filter((s) => key(s) !== key(stored))]);
      return { ok: true, set: stored, warnings: parsed.warnings };
    },
    [store],
  );

  return { configured: store.configured, sets, errors, loading, importText };
}
