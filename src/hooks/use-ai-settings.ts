import { useCallback, useEffect, useRef, useState } from "react";
import {
  AI_PROVIDER_IDS,
  defaultAiSettings,
  type AiProvider,
  type AiSettings,
  type ProviderSettings,
} from "@/lib/ai/providers";

/** Separate from the studio state, so keys never end up in brief exports. */
export const AI_SETTINGS_KEY = "pdp-genie:ai-settings:v1";

function getStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** What goes to storage: keys only when the user chose "Remember on this device". */
export function toStored(settings: AiSettings): AiSettings {
  if (settings.remember) return settings;
  return {
    ...settings,
    providers: Object.fromEntries(
      AI_PROVIDER_IDS.map((id) => [id, { ...settings.providers[id], apiKey: "" }]),
    ) as Record<AiProvider, ProviderSettings>,
  };
}

/** Read saved settings, ignoring anything malformed and filling gaps with defaults. */
export function fromStored(raw: string | null): AiSettings {
  const defaults = defaultAiSettings();
  if (!raw) return defaults;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return defaults;
  }
  if (typeof parsed !== "object" || parsed === null) return defaults;
  const p = parsed as Partial<AiSettings>;
  const str = (v: unknown, fallback: string) => (typeof v === "string" ? v : fallback);
  return {
    provider: AI_PROVIDER_IDS.includes(p.provider as AiProvider)
      ? (p.provider as AiProvider)
      : defaults.provider,
    remember: p.remember === true,
    providers: Object.fromEntries(
      AI_PROVIDER_IDS.map((id) => {
        const saved = (p.providers?.[id] ?? {}) as Partial<ProviderSettings>;
        const d = defaults.providers[id];
        return [
          id,
          {
            baseUrl: str(saved.baseUrl, d.baseUrl),
            model: str(saved.model, d.model),
            apiKey: p.remember === true ? str(saved.apiKey, "") : "",
          },
        ];
      }),
    ) as Record<AiProvider, ProviderSettings>,
  };
}

/**
 * AI provider settings for this browser. Read after mount (never during SSR).
 * Provider, address and model are remembered; keys only when `remember` is on.
 */
export function useAiSettings() {
  const [settings, setSettings] = useState<AiSettings>(defaultAiSettings);
  const loaded = useRef(false);

  useEffect(() => {
    setSettings(fromStored(getStorage()?.getItem(AI_SETTINGS_KEY) ?? null));
    loaded.current = true;
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    try {
      getStorage()?.setItem(AI_SETTINGS_KEY, JSON.stringify(toStored(settings)));
    } catch {
      /* storage full or blocked: settings still work for this visit */
    }
  }, [settings]);

  const setProvider = useCallback(
    (provider: AiProvider) => setSettings((s) => ({ ...s, provider })),
    [],
  );
  const updateActive = useCallback(
    (patch: Partial<ProviderSettings>) =>
      setSettings((s) => ({
        ...s,
        providers: { ...s.providers, [s.provider]: { ...s.providers[s.provider], ...patch } },
      })),
    [],
  );
  const setRemember = useCallback(
    (remember: boolean) => setSettings((s) => ({ ...s, remember })),
    [],
  );

  return {
    settings,
    active: settings.providers[settings.provider],
    setProvider,
    updateActive,
    setRemember,
  };
}
