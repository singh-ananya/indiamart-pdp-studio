import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  createDefaultState,
  deserializeState,
  importStudioFile,
  serializeState,
  STORAGE_BACKUP_KEY,
  STORAGE_KEY,
  studioReducer,
  type ImportResult,
} from "@/lib/pdp/studio-state";

export type SaveStatus = "loading" | "saved" | "unavailable";

function getStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null; // e.g. storage disabled by browser settings
  }
}

/**
 * Studio state persisted to this browser's localStorage.
 *
 * Saved state is read after mount (never during SSR) so server and client render
 * the same defaults. `revision` changes whenever state is replaced wholesale
 * (load, import, reset) so components with local drafts can remount.
 */
export function usePdpStudio() {
  const [state, dispatch] = useReducer(studioReducer, undefined, createDefaultState);
  const [revision, setRevision] = useState(0);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("loading");
  const [loadWarning, setLoadWarning] = useState<string | null>(null);
  const hydrated = useRef(false);

  useEffect(() => {
    const storage = getStorage();
    if (!storage) {
      hydrated.current = true;
      setSaveStatus("unavailable");
      return;
    }
    const result = deserializeState(storage.getItem(STORAGE_KEY));
    if (result.status === "loaded") {
      dispatch({ type: "hydrate", state: result.state });
      setRevision((r) => r + 1);
    } else if (result.status === "unreadable") {
      // Keep a copy before the next save overwrites it.
      try {
        storage.setItem(STORAGE_BACKUP_KEY, storage.getItem(STORAGE_KEY) ?? "");
      } catch {
        /* ignore quota errors; the warning below still shows */
      }
      setLoadWarning(
        `Saved studio data could not be read, so demo data was loaded. A copy was kept under "${STORAGE_BACKUP_KEY}".`,
      );
    }
    hydrated.current = true;
    setSaveStatus("saved");
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    const storage = getStorage();
    if (!storage) return;
    const handle = window.setTimeout(() => {
      try {
        storage.setItem(STORAGE_KEY, serializeState(state));
        setSaveStatus("saved");
      } catch {
        setSaveStatus("unavailable");
      }
    }, 250);
    return () => window.clearTimeout(handle);
  }, [state]);

  /** Validates fully first; on any error the current state is left untouched. */
  const importText = useCallback((text: string): ImportResult => {
    const result = importStudioFile(text);
    if (result.ok) {
      dispatch({ type: "applyImport", data: result.data });
      setRevision((r) => r + 1);
    }
    return result;
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: "reset" });
    setRevision((r) => r + 1);
  }, []);

  return { state, dispatch, revision, saveStatus, loadWarning, importText, reset };
}
