import { useCallback, useEffect, useRef, useState } from "react";
import { parseMcatConfigText, sha256Hex, type McatConfig } from "@/lib/pdp/mcat-config";
import {
  createIndexedDbCache,
  createSupabaseRemote,
  isAllowedEmail,
  type McatConfigCache,
  type McatConfigRemote,
  type McatConfigVersion,
} from "@/lib/pdp/mcat-config-store";

export type McatConfigStatus =
  "not-configured" | "loading" | "signed-out" | "wrong-account" | "ready" | "empty" | "error";

export interface ActiveMcatConfig {
  config: McatConfig;
  version: McatConfigVersion;
  /** Where this copy came from in this session. */
  origin: "cache" | "download" | "upload";
}

export type UploadResult = { ok: true; active: ActiveMcatConfig } | { ok: false; errors: string[] };

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * The shared MCAT configuration.
 *
 * On sign-in: show the last valid copy cached in this browser, then compare its
 * SHA-256 with the active version in Supabase and download only when they differ.
 * A new file is used only after its hash and full validation pass; any failure
 * keeps the configuration already in use. Uploads are validated in full before
 * anything is sent, and the active version moves only once the upload succeeded.
 */
export function useMcatConfig(deps?: { remote?: McatConfigRemote; cache?: McatConfigCache }) {
  const [remote] = useState(() => deps?.remote ?? createSupabaseRemote());
  const [cache] = useState(() => deps?.cache ?? createIndexedDbCache());
  const [status, setStatus] = useState<McatConfigStatus>(
    remote.configured ? "loading" : "not-configured",
  );
  // `known` is false until the stored session has been read.
  const [session, setSession] = useState<{ known: boolean; email: string | null }>({
    known: false,
    email: null,
  });
  const email = session.email;
  const [active, setActiveState] = useState<ActiveMcatConfig | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const activeRef = useRef<ActiveMcatConfig | null>(null);
  const run = useRef(0);

  const setActive = (next: ActiveMcatConfig | null) => {
    activeRef.current = next;
    setActiveState(next);
  };

  const saveToCache = useCallback(
    async (text: string, version: McatConfigVersion) => {
      try {
        await cache.write({ sha256: version.sha256, text, version });
      } catch (error) {
        setNotice(
          `Could not keep a copy in this browser (${message(error)}). It will be downloaded again next visit; any earlier cached copy is unchanged.`,
        );
      }
    },
    [cache],
  );

  const refresh = useCallback(async () => {
    const id = ++run.current;
    const current = () => id === run.current;
    setChecking(true);
    setErrors([]);
    try {
      // 1. Last valid copy from this browser, shown straight away.
      if (!activeRef.current) {
        const cached = await cache.read().catch(() => null);
        if (!current()) return;
        if (cached) {
          const parsed = parseMcatConfigText(cached.text);
          if (parsed.ok)
            setActive({ config: parsed.config, version: cached.version, origin: "cache" });
        }
      }

      // 2. Small metadata request: which version is active?
      let latest: McatConfigVersion | null;
      try {
        latest = await remote.getActiveVersion();
      } catch (error) {
        if (!current()) return;
        setErrors([
          `Could not check Supabase for the active MCAT configuration: ${message(error)}`,
          ...(activeRef.current ? ["Using the copy cached in this browser."] : []),
        ]);
        setStatus(activeRef.current ? "ready" : "error");
        return;
      }
      if (!current()) return;
      if (!latest) {
        setStatus(activeRef.current ? "ready" : "empty");
        return;
      }

      // 3. Same content already in use: no download.
      const inUse = activeRef.current;
      if (inUse && inUse.version.sha256 === latest.sha256) {
        setActive({ ...inUse, version: latest });
        setStatus("ready");
        return;
      }

      // 4. Download, verify, validate; only then switch.
      const keep = inUse ? "The configuration already in use was kept." : "Nothing was loaded.";
      try {
        const bytes = await remote.download(latest);
        if (!current()) return;
        if ((await sha256Hex(bytes)) !== latest.sha256) {
          throw new Error("the downloaded file does not match its recorded SHA-256");
        }
        const text = new TextDecoder().decode(bytes);
        const parsed = parseMcatConfigText(text);
        if (!parsed.ok) {
          setErrors([
            `The active configuration (${latest.fileName}) is not valid. ${keep}`,
            ...parsed.errors,
          ]);
          setStatus(inUse ? "ready" : "error");
          return;
        }
        setActive({ config: parsed.config, version: latest, origin: "download" });
        setStatus("ready");
        await saveToCache(text, latest);
      } catch (error) {
        if (!current()) return;
        setErrors([`Could not download ${latest.fileName}: ${message(error)}. ${keep}`]);
        setStatus(inUse ? "ready" : "error");
      }
    } finally {
      if (current()) setChecking(false);
    }
  }, [cache, remote, saveToCache]);

  // Session: read once, then follow sign-in / sign-out.
  useEffect(() => {
    if (!remote.configured) return;
    let cancelled = false;
    void remote
      .getUserEmail()
      .catch(() => null)
      .then((value) => {
        if (!cancelled) setSession({ known: true, email: value });
      });
    // Token refreshes repeat the same email; keep the same object so nothing re-runs.
    const unsubscribe = remote.onAuthChange((value) =>
      setSession((prev) =>
        prev.known && prev.email === value ? prev : { known: true, email: value },
      ),
    );
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [remote]);

  useEffect(() => {
    if (!remote.configured || !session.known) return;
    if (session.email === null) {
      run.current++;
      setActive(null);
      setStatus("signed-out");
      return;
    }
    if (!isAllowedEmail(session.email)) {
      run.current++;
      setActive(null);
      setStatus("wrong-account");
      return;
    }
    void refresh();
  }, [session, refresh, remote.configured]);

  const upload = useCallback(
    async (bytes: Uint8Array, fileName: string): Promise<UploadResult> => {
      const text = new TextDecoder().decode(bytes);
      const parsed = parseMcatConfigText(text);
      if (!parsed.ok) return { ok: false, errors: parsed.errors };
      let version: McatConfigVersion;
      try {
        const sha256 = await sha256Hex(bytes);
        version = await remote.uploadAndActivate({
          bytes,
          sha256,
          config: parsed.config,
          fileName,
        });
      } catch (error) {
        return { ok: false, errors: [`Upload failed: ${message(error)}`] };
      }
      run.current++; // a slower refresh must not overwrite the new version
      const next: ActiveMcatConfig = { config: parsed.config, version, origin: "upload" };
      setActive(next);
      setStatus("ready");
      setErrors([]);
      setNotice(null);
      setChecking(false);
      await saveToCache(text, version);
      return { ok: true, active: next };
    },
    [remote, saveToCache],
  );

  const sendSignInLink = useCallback(
    async (address: string): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (!isAllowedEmail(address)) {
        return { ok: false, error: "Use your @indiamart.com email address." };
      }
      try {
        await remote.sendSignInLink(address);
        return { ok: true };
      } catch (error) {
        return { ok: false, error: message(error) };
      }
    },
    [remote],
  );

  const signOut = useCallback(async () => {
    await remote.signOut();
    // Do not leave internal data on a shared machine after signing out.
    await cache.clear().catch(() => undefined);
    setActive(null);
    setNotice(null);
    setErrors([]);
  }, [cache, remote]);

  return {
    configured: remote.configured,
    status,
    email,
    active,
    errors,
    notice,
    checking,
    refresh,
    upload,
    sendSignInLink,
    signOut,
  };
}
