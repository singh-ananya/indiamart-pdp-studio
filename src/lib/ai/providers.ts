/**
 * AI provider settings for PDP Genie (OpenAI-compatible APIs).
 *
 * The key is entered by each user and stays in their browser. It is sent only to the
 * chosen provider's server address — never to Supabase and never in studio exports.
 * Model names and prices are read live from the provider; nothing here is hard-coded
 * except which OpenRouter models are offered as quick picks.
 */

export type AiProvider = "openrouter" | "groq" | "litellm";

export interface ProviderInfo {
  label: string;
  /** Empty when the user must supply it (self-hosted LiteLLM). */
  defaultBaseUrl: string;
  keyLabel: string;
  keyPlaceholder: string;
  /** Whether listing models needs the key. */
  modelsNeedKey: boolean;
}

export const AI_PROVIDERS: Record<AiProvider, ProviderInfo> = {
  openrouter: {
    label: "OpenRouter",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    keyLabel: "OpenRouter key",
    keyPlaceholder: "sk-or-v1-…",
    modelsNeedKey: false,
  },
  groq: {
    label: "Groq",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    keyLabel: "Groq key",
    keyPlaceholder: "gsk_…",
    modelsNeedKey: true,
  },
  litellm: {
    label: "LiteLLM",
    defaultBaseUrl: "",
    keyLabel: "LiteLLM key",
    keyPlaceholder: "sk-…",
    modelsNeedKey: true,
  },
};

export const AI_PROVIDER_IDS = Object.keys(AI_PROVIDERS) as AiProvider[];

/** Quick picks shown as cards for OpenRouter. Names and prices come from the live list. */
export const OPENROUTER_QUICK_PICKS = [
  "qwen/qwen3.8-flash",
  "deepseek/deepseek-v4-flash",
  "deepseek/deepseek-v4.1-flash",
  "z-ai/glm-5.3-flash",
  "google/gemini-3.1-flash-lite",
] as const;

export const DEFAULT_MODELS: Record<AiProvider, string> = {
  openrouter: OPENROUTER_QUICK_PICKS[0],
  groq: "",
  litellm: "",
};

export interface ProviderSettings {
  baseUrl: string;
  model: string;
  apiKey: string;
}

export interface AiSettings {
  provider: AiProvider;
  providers: Record<AiProvider, ProviderSettings>;
  /** Keep keys in this browser's storage between visits. */
  remember: boolean;
}

export function defaultAiSettings(): AiSettings {
  return {
    provider: "openrouter",
    providers: Object.fromEntries(
      AI_PROVIDER_IDS.map((id) => [
        id,
        { baseUrl: AI_PROVIDERS[id].defaultBaseUrl, model: DEFAULT_MODELS[id], apiKey: "" },
      ]),
    ) as Record<AiProvider, ProviderSettings>,
    remember: false,
  };
}

export interface ModelInfo {
  id: string;
  name: string;
  /** US dollars per million tokens, when the provider publishes it. */
  inputPerMillion?: number | undefined;
  outputPerMillion?: number | undefined;
}

/** Server address must be https, or http on localhost (a local LiteLLM proxy). */
export function checkBaseUrl(baseUrl: string): string | null {
  const value = baseUrl.trim();
  if (!value) return "Enter the server address.";
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "Server address is not a valid URL.";
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
    return "Server address must start with https:// (http:// only for localhost).";
  }
  return null;
}

const endpoint = (baseUrl: string, path: string) => `${baseUrl.trim().replace(/\/+$/, "")}${path}`;

function headers(provider: AiProvider, apiKey: string): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey.trim()) h["Authorization"] = `Bearer ${apiKey.trim()}`;
  if (provider === "openrouter" && typeof window !== "undefined") {
    // Optional attribution headers OpenRouter recommends for browser apps.
    h["HTTP-Referer"] = window.location.origin;
    h["X-Title"] = "PDP Genie";
  }
  return h;
}

const perMillion = (value: unknown): number | undefined => {
  const n = typeof value === "string" || typeof value === "number" ? Number(value) : NaN;
  return Number.isFinite(n) && n >= 0 ? n * 1_000_000 : undefined;
};

/** Parse an OpenAI-compatible /models response. Unknown shapes give an empty list. */
export function parseModelList(body: unknown): ModelInfo[] {
  const data = (body as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return [];
  return data
    .filter((m): m is Record<string, unknown> => typeof m === "object" && m !== null)
    .filter((m) => typeof m["id"] === "string" && m["id"] !== "")
    .map((m) => {
      const pricing = (m["pricing"] ?? {}) as Record<string, unknown>;
      return {
        id: m["id"] as string,
        name:
          typeof m["name"] === "string" && m["name"] ? (m["name"] as string) : (m["id"] as string),
        inputPerMillion: perMillion(pricing["prompt"]),
        outputPerMillion: perMillion(pricing["completion"]),
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

const unreachable = (baseUrl: string) => {
  let host = baseUrl;
  try {
    host = new URL(baseUrl).host;
  } catch {
    /* keep as typed */
  }
  return `Could not reach ${host}. It may be offline, or it may not accept requests from a browser (CORS).`;
};

async function errorFrom(response: Response): Promise<string> {
  let detail = "";
  try {
    const body = (await response.json()) as { error?: { message?: unknown } | string };
    detail =
      typeof body.error === "string"
        ? body.error
        : typeof body.error?.message === "string"
          ? body.error.message
          : "";
  } catch {
    /* not JSON */
  }
  const hint =
    response.status === 401 || response.status === 403
      ? "The key was rejected."
      : response.status === 404
        ? "Check the server address and model name."
        : response.status === 429
          ? "Rate limited or out of credits."
          : "";
  return [`HTTP ${response.status}`, hint, detail].filter(Boolean).join(" — ");
}

export type ListResult = { ok: true; models: ModelInfo[] } | { ok: false; error: string };

export async function listModels(
  provider: AiProvider,
  settings: ProviderSettings,
  fetchImpl: typeof fetch = fetch,
): Promise<ListResult> {
  const bad = checkBaseUrl(settings.baseUrl);
  if (bad) return { ok: false, error: bad };
  if (AI_PROVIDERS[provider].modelsNeedKey && !settings.apiKey.trim()) {
    return { ok: false, error: `Enter your ${AI_PROVIDERS[provider].keyLabel} to load models.` };
  }
  let response: Response;
  try {
    response = await fetchImpl(endpoint(settings.baseUrl, "/models"), {
      headers: headers(provider, settings.apiKey),
    });
  } catch {
    return { ok: false, error: unreachable(settings.baseUrl) };
  }
  if (!response.ok) return { ok: false, error: await errorFrom(response) };
  try {
    return { ok: true, models: parseModelList(await response.json()) };
  } catch {
    return { ok: false, error: "The model list was not valid JSON." };
  }
}

export type TestResult = { ok: true; reply: string } | { ok: false; error: string };

/** Send a tiny chat request to prove the key, address and model work together. */
export async function testConnection(
  provider: AiProvider,
  settings: ProviderSettings,
  fetchImpl: typeof fetch = fetch,
): Promise<TestResult> {
  const bad = checkBaseUrl(settings.baseUrl);
  if (bad) return { ok: false, error: bad };
  if (!settings.apiKey.trim()) {
    return { ok: false, error: `Enter your ${AI_PROVIDERS[provider].keyLabel}.` };
  }
  if (!settings.model.trim()) return { ok: false, error: "Choose a model." };
  let response: Response;
  try {
    response = await fetchImpl(endpoint(settings.baseUrl, "/chat/completions"), {
      method: "POST",
      headers: headers(provider, settings.apiKey),
      body: JSON.stringify({
        model: settings.model.trim(),
        messages: [{ role: "user", content: "Reply with the single word OK." }],
        max_tokens: 16,
        temperature: 0,
      }),
    });
  } catch {
    return { ok: false, error: unreachable(settings.baseUrl) };
  }
  if (!response.ok) return { ok: false, error: await errorFrom(response) };
  try {
    const body = (await response.json()) as {
      choices?: { message?: { content?: unknown } }[];
    };
    if (!Array.isArray(body.choices)) {
      return { ok: false, error: "The server answered, but not like a chat model." };
    }
    const content = body.choices[0]?.message?.content;
    return { ok: true, reply: typeof content === "string" ? content.trim() : "" };
  } catch {
    return { ok: false, error: "The server's reply was not valid JSON." };
  }
}

/** "$0.15 in · $0.47 out" per million tokens; null when the provider gives no prices. */
export function formatPrice(model: ModelInfo | undefined): string | null {
  if (model?.inputPerMillion === undefined || model.outputPerMillion === undefined) return null;
  const fmt = (n: number) => (n === 0 ? "$0" : n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);
  return `${fmt(model.inputPerMillion)} in · ${fmt(model.outputPerMillion)} out`;
}
