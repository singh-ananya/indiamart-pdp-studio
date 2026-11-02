import { getSupabaseClient } from "./mcat-config-store";
import { serializeSavedResult, validateSavedResult, type SavedResultData } from "./studio-state";

/**
 * Saved results, shared through the Supabase table pdp_saved_results (see
 * supabase/migrations/*_pdp_saved_results.sql). Rows are validated again when read;
 * invalid ones are skipped and reported, never shown.
 */

export interface SavedResult {
  id: number;
  createdBy: string;
  createdAt: string;
  data: SavedResultData;
}

export interface SavedResultsRemote {
  readonly configured: boolean;
  /** Newest first. */
  listRecent(): Promise<{ results: SavedResult[]; skipped: string[] }>;
  save(data: SavedResultData): Promise<SavedResult>;
}

const LIST_LIMIT = 100;

interface Row {
  id: number;
  data: unknown;
  created_by: string;
  created_at: string;
}

export function rowsToResults(rows: Row[]): { results: SavedResult[]; skipped: string[] } {
  const results: SavedResult[] = [];
  const skipped: string[] = [];
  for (const row of rows) {
    const parsed = validateSavedResult(row.data);
    if (parsed.ok) {
      results.push({
        id: row.id,
        createdBy: row.created_by,
        createdAt: row.created_at,
        data: parsed.data,
      });
    } else {
      skipped.push(`Saved result #${row.id} could not be read and is hidden: ${parsed.error}`);
    }
  }
  return { results, skipped };
}

export function createSupabaseSavedResultsRemote(): SavedResultsRemote {
  const supabase = getSupabaseClient();
  const required = () => {
    if (!supabase) throw new Error("Supabase is not configured for this build");
    return supabase;
  };
  return {
    configured: supabase !== null,
    async listRecent() {
      const { data, error } = await required()
        .from("pdp_saved_results")
        .select("id, data, created_by, created_at")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(LIST_LIMIT)
        .returns<Row[]>();
      if (error) throw new Error(error.message);
      return rowsToResults(data ?? []);
    },
    async save(result) {
      const { data, error } = await required()
        .from("pdp_saved_results")
        .insert({
          mcat_name: result.mcat,
          mcat_id: result.mcatId,
          model: result.aiDesign.model,
          data: serializeSavedResult(result),
        })
        .select("id, data, created_by, created_at")
        .single<Row>();
      if (error) throw new Error(error.message);
      return {
        id: data!.id,
        createdBy: data!.created_by,
        createdAt: data!.created_at,
        data: result,
      };
    },
  };
}

/** In-memory version for tests. */
export function createMemorySavedResultsRemote(
  options: { results?: SavedResult[]; failSave?: boolean } = {},
) {
  let rows = [...(options.results ?? [])];
  const remote = {
    configured: true,
    get rows() {
      return rows;
    },
    async listRecent() {
      return { results: [...rows].sort((a, b) => b.id - a.id), skipped: [] as string[] };
    },
    async save(data: SavedResultData) {
      if (options.failSave) throw new Error("permission denied");
      const saved: SavedResult = {
        id: rows.length + 1,
        createdBy: "tester@indiamart.com",
        createdAt: new Date(Date.UTC(2026, 10, 3, 9, rows.length)).toISOString(),
        data,
      };
      rows = [...rows, saved];
      return saved;
    },
  };
  return remote;
}
