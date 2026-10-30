import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { McatConfig } from "./mcat-config";

/**
 * Where the MCAT configuration lives.
 *
 * - Remote (canonical): Supabase Storage bucket "mcat-config" (private), one object
 *   per version at versions/<sha256>.json, plus version metadata and an "active"
 *   pointer in the database. See supabase/migrations/*_mcat_config.sql.
 * - Cache: the last valid file in this browser's IndexedDB, keyed by SHA-256, so
 *   the ~32 MB file is downloaded only when the active version changes.
 *
 * Only the publishable key is used here. Access is enforced by the database
 * policies: signed-in @indiamart.com users only.
 */

export const MCAT_BUCKET = "mcat-config";

export function isAllowedEmail(email: string): boolean {
  return /^[^\s@]+@indiamart\.com$/i.test(email.trim());
}

export function versionObjectPath(sha256: string): string {
  return `versions/${sha256}.json`;
}

export interface McatConfigVersion {
  id: number;
  sha256: string;
  objectPath: string;
  sizeBytes: number;
  /** `version` from the file; empty when the file does not state one. */
  version: string;
  fileName: string;
  mcatCount: number;
  warnings: string[];
  uploadedBy: string;
  uploadedAt: string;
}

export interface CachedMcatConfig {
  sha256: string;
  text: string;
  version: McatConfigVersion;
}

export interface McatConfigCache {
  read(): Promise<CachedMcatConfig | null>;
  /** Atomic: on failure the previously cached record is left as it was. */
  write(record: CachedMcatConfig): Promise<void>;
  clear(): Promise<void>;
}

export interface UploadInput {
  bytes: Uint8Array;
  sha256: string;
  config: McatConfig;
  fileName: string;
}

export interface McatConfigRemote {
  /** False when this build has no Supabase URL/key. */
  readonly configured: boolean;
  getUserEmail(): Promise<string | null>;
  /** Calls back on sign-in and sign-out; returns an unsubscribe function. */
  onAuthChange(listener: (email: string | null) => void): () => void;
  sendSignInLink(email: string): Promise<void>;
  signOut(): Promise<void>;
  /** Metadata of the active version (small); null when none has been uploaded. */
  getActiveVersion(): Promise<McatConfigVersion | null>;
  download(version: McatConfigVersion): Promise<Uint8Array>;
  /**
   * Store the file and make it active. Throws on any failure, in which case the
   * previously active version is still active.
   */
  uploadAndActivate(input: UploadInput): Promise<McatConfigVersion>;
}

// ---------------------------------------------------------------------------
// IndexedDB cache
// ---------------------------------------------------------------------------

const DB_NAME = "indiamart-pdp-studio";
/**
 * Version 1 was used by an earlier local-only build with a "mcat-config" store, so
 * browsers that ran it already have version 1 without the cache store. Bump this
 * whenever the stores change so onupgradeneeded runs.
 */
const DB_VERSION = 2;
const CACHE_STORE = "mcat-config-cache";
const LEGACY_STORES = ["mcat-config"];
const CACHE_KEY = "active";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      // Drop stores from older builds (one may hold a stale 32 MB copy).
      for (const name of LEGACY_STORES) {
        if (db.objectStoreNames.contains(name)) db.deleteObjectStore(name);
      }
      if (!db.objectStoreNames.contains(CACHE_STORE)) db.createObjectStore(CACHE_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open IndexedDB"));
    request.onblocked = () => reject(new Error("IndexedDB is blocked by another tab"));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(CACHE_STORE, mode);
      const request = run(tx.objectStore(CACHE_STORE));
      // Resolve on commit, so a write is only reported once it is durable.
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
      tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
    });
  } finally {
    db.close();
  }
}

function isCachedMcatConfig(value: unknown): value is CachedMcatConfig {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v["sha256"] === "string" &&
    typeof v["text"] === "string" &&
    typeof v["version"] === "object" &&
    v["version"] !== null
  );
}

export function createIndexedDbCache(): McatConfigCache {
  const available = typeof indexedDB !== "undefined";
  return {
    async read() {
      if (!available) return null;
      const value = await withStore<unknown>("readonly", (store) => store.get(CACHE_KEY));
      return isCachedMcatConfig(value) ? value : null;
    },
    async write(record) {
      if (!available) throw new Error("IndexedDB is not available in this browser");
      await withStore("readwrite", (store) => store.put(record, CACHE_KEY));
    },
    async clear() {
      if (!available) return;
      await withStore("readwrite", (store) => store.delete(CACHE_KEY));
    },
  };
}

// ---------------------------------------------------------------------------
// Supabase
// ---------------------------------------------------------------------------

interface VersionRow {
  id: number;
  sha256: string;
  object_path: string;
  size_bytes: number;
  version: string;
  file_name: string;
  mcat_count: number;
  warnings: unknown;
  uploaded_by: string;
  uploaded_at: string;
}

const VERSION_COLUMNS =
  "id, sha256, object_path, size_bytes, version, file_name, mcat_count, warnings, uploaded_by, uploaded_at";

function toVersion(row: VersionRow): McatConfigVersion {
  return {
    id: row.id,
    sha256: row.sha256,
    objectPath: row.object_path,
    sizeBytes: Number(row.size_bytes),
    version: row.version,
    fileName: row.file_name,
    mcatCount: row.mcat_count,
    warnings: Array.isArray(row.warnings)
      ? row.warnings.filter((w): w is string => typeof w === "string")
      : [],
    uploadedBy: row.uploaded_by,
    uploadedAt: row.uploaded_at,
  };
}

function throwIf(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

let client: SupabaseClient | null = null;

/** Browser-only client; null during SSR or when the build has no Supabase settings. */
function getClient(): SupabaseClient | null {
  if (typeof window === "undefined") return null;
  const url = import.meta.env["VITE_SUPABASE_URL"] as string | undefined;
  const key = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string | undefined;
  if (!url || !key) return null;
  client ??= createClient(url, key);
  return client;
}

export function createSupabaseRemote(): McatConfigRemote {
  const supabase = getClient();
  const required = () => {
    if (!supabase) throw new Error("Supabase is not configured for this build");
    return supabase;
  };

  return {
    configured: supabase !== null,

    async getUserEmail() {
      if (!supabase) return null;
      const { data } = await supabase.auth.getSession();
      return data.session?.user.email ?? null;
    },

    onAuthChange(listener) {
      if (!supabase) return () => {};
      const { data } = supabase.auth.onAuthStateChange((_event, session) =>
        listener(session?.user.email ?? null),
      );
      return () => data.subscription.unsubscribe();
    },

    async sendSignInLink(email) {
      const { error } = await required().auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: window.location.origin },
      });
      throwIf(error);
    },

    async signOut() {
      throwIf((await required().auth.signOut()).error);
    },

    async getActiveVersion() {
      const { data, error } = await required()
        .from("mcat_config_active")
        .select(`mcat_config_versions (${VERSION_COLUMNS})`)
        .maybeSingle<{ mcat_config_versions: VersionRow | null }>();
      throwIf(error);
      return data?.mcat_config_versions ? toVersion(data.mcat_config_versions) : null;
    },

    async download(version) {
      const { data, error } = await required()
        .storage.from(MCAT_BUCKET)
        .download(version.objectPath);
      throwIf(error);
      return new Uint8Array(await data!.arrayBuffer());
    },

    async uploadAndActivate({ bytes, sha256, config, fileName }) {
      const db = required();
      const path = versionObjectPath(sha256);
      const uploaded = await db.storage
        .from(MCAT_BUCKET)
        .upload(path, new Blob([bytes as BlobPart], { type: "application/json" }), {
          contentType: "application/json",
          upsert: false,
        });
      // Objects are content-addressed, so "already exists" means identical content.
      if (uploaded.error && !/already exists|duplicate/i.test(uploaded.error.message)) {
        throw new Error(uploaded.error.message);
      }
      const activated = await db.rpc("activate_uploaded_mcat_config", {
        p_sha256: sha256,
        p_size_bytes: bytes.byteLength,
        p_version: config.version,
        p_file_name: fileName,
        p_mcat_count: config.mcatCount,
        p_warnings: config.warnings,
      });
      throwIf(activated.error);
      const { data, error } = await db
        .from("mcat_config_versions")
        .select(VERSION_COLUMNS)
        .eq("id", activated.data as number)
        .single<VersionRow>();
      throwIf(error);
      return toVersion(data!);
    },
  };
}

// ---------------------------------------------------------------------------
// In-memory versions for tests
// ---------------------------------------------------------------------------

export function createMemoryCache(
  options: { record?: CachedMcatConfig | null; failWrite?: boolean } = {},
) {
  const cache = {
    record: options.record ?? null,
    writes: 0,
    async read() {
      return cache.record;
    },
    async write(record: CachedMcatConfig) {
      if (options.failWrite) throw new Error("QuotaExceededError");
      cache.writes++;
      cache.record = record;
    },
    async clear() {
      cache.record = null;
    },
  };
  return cache;
}

/** Mirrors the database rules: signed-in @indiamart.com users only; failed uploads change nothing. */
export function createMemoryRemote(
  options: {
    email?: string | null;
    /** Files already stored, by SHA-256; the first is active. */
    files?: {
      bytes: Uint8Array;
      version: Omit<McatConfigVersion, "id" | "sha256" | "objectPath" | "sizeBytes">;
      sha256: string;
    }[];
    failDownload?: boolean;
    failUpload?: boolean;
    /** Serve different bytes than stored, to test hash checking. */
    corruptDownload?: boolean;
  } = {},
) {
  let email = options.email ?? null;
  const listeners = new Set<(email: string | null) => void>();
  const objects = new Map<string, Uint8Array>();
  const versions: McatConfigVersion[] = [];
  let activeId: number | null = null;

  const record = (
    sha256: string,
    bytes: Uint8Array,
    meta: Omit<McatConfigVersion, "id" | "sha256" | "objectPath" | "sizeBytes">,
  ) => {
    const existing = versions.find((v) => v.sha256 === sha256);
    if (existing) return existing;
    const version: McatConfigVersion = {
      ...meta,
      id: versions.length + 1,
      sha256,
      objectPath: versionObjectPath(sha256),
      sizeBytes: bytes.byteLength,
    };
    objects.set(version.objectPath, bytes);
    versions.push(version);
    return version;
  };
  for (const file of options.files ?? []) record(file.sha256, file.bytes, file.version);
  if (versions.length > 0) activeId = versions[0]!.id;

  const signedIn = () => {
    if (!email || !isAllowedEmail(email)) throw new Error("permission denied");
  };

  const remote = {
    configured: true,
    sentLinks: [] as string[],
    downloads: 0,
    get activeVersion() {
      return versions.find((v) => v.id === activeId) ?? null;
    },
    setEmail(next: string | null) {
      email = next;
      listeners.forEach((listener) => listener(email));
    },
    async getUserEmail() {
      return email;
    },
    onAuthChange(listener: (email: string | null) => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    async sendSignInLink(address: string) {
      remote.sentLinks.push(address);
    },
    async signOut() {
      remote.setEmail(null);
    },
    async getActiveVersion() {
      signedIn();
      return remote.activeVersion;
    },
    async download(version: McatConfigVersion) {
      signedIn();
      remote.downloads++;
      if (options.failDownload) throw new Error("network error");
      const bytes = objects.get(version.objectPath);
      if (!bytes) throw new Error("Object not found");
      return options.corruptDownload ? new TextEncoder().encode('{"tampered":true}') : bytes;
    },
    async uploadAndActivate({ bytes, sha256, config, fileName }: UploadInput) {
      signedIn();
      if (options.failUpload) throw new Error("Payload too large");
      const version = record(sha256, bytes, {
        version: config.version,
        fileName,
        mcatCount: config.mcatCount,
        warnings: config.warnings,
        uploadedBy: email!,
        uploadedAt: "2026-10-27T12:00:00.000Z",
      });
      activeId = version.id;
      return version;
    },
  };
  return remote;
}
