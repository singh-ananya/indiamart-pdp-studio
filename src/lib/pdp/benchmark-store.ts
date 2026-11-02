import { validateBenchmarkFile, type BenchmarkFile } from "./benchmark";
import { getSupabaseClient } from "./mcat-config-store";

/**
 * Benchmark research files, shared through the Supabase table pdp_benchmarks (see
 * supabase/migrations/*_pdp_benchmarks.sql). The newest file per MCAT is used.
 * Rows read back are validated again before use; invalid rows are skipped and
 * reported, never shown.
 */

export interface StoredBenchmark {
  id: number;
  uploadedBy: string;
  uploadedAt: string;
  file: BenchmarkFile;
}

export interface BenchmarkRemote {
  readonly configured: boolean;
  /** Newest valid set per MCAT, plus messages about rows that could not be used. */
  listLatest(): Promise<{ sets: StoredBenchmark[]; skipped: string[] }>;
  upload(file: BenchmarkFile): Promise<StoredBenchmark>;
}

const mcatKey = (file: BenchmarkFile) =>
  file.mcat.id ? `id:${file.mcat.id}` : `name:${file.mcat.name.trim().toLowerCase()}`;

/** Keep the newest set per MCAT; input must be newest first. */
export function latestPerMcat(sets: StoredBenchmark[]): StoredBenchmark[] {
  const seen = new Set<string>();
  return sets.filter((set) => {
    const key = mcatKey(set.file);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export interface Row {
  id: number;
  mcat_id: string;
  mcat_name: string;
  data: unknown;
  uploaded_by: string;
  uploaded_at: string;
}

/**
 * Validate only the newest row per MCAT (rows must be newest first). Superseded rows
 * are history and are never shown, so a stale invalid one is not reported again.
 * A newest row that fails validation is skipped and reported; the MCAT then has no
 * research rather than falling back to an older, superseded file.
 */
export function newestValidPerMcat(rows: Row[]): { sets: StoredBenchmark[]; skipped: string[] } {
  const seen = new Set<string>();
  const sets: StoredBenchmark[] = [];
  const skipped: string[] = [];
  for (const row of rows) {
    const key = row.mcat_id ? `id:${row.mcat_id}` : `name:${row.mcat_name.trim().toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const parsed = validateBenchmarkFile(row.data);
    if (parsed.ok) {
      sets.push({
        id: row.id,
        uploadedBy: row.uploaded_by,
        uploadedAt: row.uploaded_at,
        file: parsed.file,
      });
    } else {
      skipped.push(
        `Saved research for ${row.mcat_name} (#${row.id}) no longer passes validation and is hidden: ${parsed.errors[0]}. Import a corrected file.`,
      );
    }
  }
  return { sets, skipped };
}

export function createSupabaseBenchmarkRemote(): BenchmarkRemote {
  const supabase = getSupabaseClient();
  const required = () => {
    if (!supabase) throw new Error("Supabase is not configured for this build");
    return supabase;
  };
  return {
    configured: supabase !== null,

    async listLatest() {
      const { data, error } = await required()
        .from("pdp_benchmarks")
        .select("id, mcat_id, mcat_name, data, uploaded_by, uploaded_at")
        .order("uploaded_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(200)
        .returns<Row[]>();
      if (error) throw new Error(error.message);
      return newestValidPerMcat(data ?? []);
    },

    async upload(file) {
      const { data, error } = await required()
        .from("pdp_benchmarks")
        .insert({
          mcat_name: file.mcat.name,
          mcat_id: file.mcat.id,
          entry_count: file.entries.length,
          data: file,
        })
        .select("id, mcat_id, mcat_name, data, uploaded_by, uploaded_at")
        .single<Row>();
      if (error) throw new Error(error.message);
      return { id: data!.id, uploadedBy: data!.uploaded_by, uploadedAt: data!.uploaded_at, file };
    },
  };
}

/** In-memory version for tests. */
export function createMemoryBenchmarkRemote(
  options: { sets?: StoredBenchmark[]; failUpload?: boolean } = {},
) {
  let rows = [...(options.sets ?? [])];
  const remote = {
    configured: true,
    get rows() {
      return rows;
    },
    async listLatest() {
      const newestFirst = [...rows].sort(
        (a, b) => b.uploadedAt.localeCompare(a.uploadedAt) || b.id - a.id,
      );
      return { sets: latestPerMcat(newestFirst), skipped: [] as string[] };
    },
    async upload(file: BenchmarkFile) {
      if (options.failUpload) throw new Error("permission denied");
      const set: StoredBenchmark = {
        id: rows.length + 1,
        uploadedBy: "tester@indiamart.com",
        uploadedAt: new Date(Date.UTC(2026, 10, 2, 12, rows.length)).toISOString(),
        file,
      };
      rows = [...rows, set];
      return set;
    },
  };
  return remote;
}
