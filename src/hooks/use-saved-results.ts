import { useCallback, useEffect, useState } from "react";
import {
  createSupabaseSavedResultsRemote,
  type SavedResult,
  type SavedResultsRemote,
} from "@/lib/pdp/saved-results-store";
import type { SavedResultData } from "@/lib/pdp/studio-state";

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Shared saved results (newest first), loaded once a permitted user is signed in. */
export function useSavedResults(signedIn: boolean, remote?: SavedResultsRemote) {
  const [store] = useState(() => remote ?? createSupabaseSavedResultsRemote());
  const [results, setResults] = useState<SavedResult[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!store.configured || !signedIn) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    store
      .listRecent()
      .then(({ results: loaded, skipped }) => {
        if (cancelled) return;
        setResults(loaded);
        setErrors(skipped);
      })
      .catch((error: unknown) => {
        if (!cancelled) setErrors([`Could not load saved results: ${message(error)}`]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [store, signedIn]);

  /** Save a finished result for everyone; returns an error message on failure. */
  const save = useCallback(
    async (data: SavedResultData): Promise<string | null> => {
      try {
        const saved = await store.save(data);
        setResults((prev) => [saved, ...prev]);
        return null;
      } catch (error) {
        return message(error);
      }
    },
    [store],
  );

  return { configured: store.configured, results, errors, loading, save };
}
