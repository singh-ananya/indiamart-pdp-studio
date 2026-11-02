import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { PdpStudio } from "@/components/pdp/studio";
import { AI_SETTINGS_KEY, fromStored, toStored } from "@/hooks/use-ai-settings";
import {
  checkBaseUrl,
  defaultAiSettings,
  formatPrice,
  listModels,
  parseModelList,
  testConnection,
} from "@/lib/ai/providers";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const MODELS = {
  data: [
    {
      id: "qwen/qwen3.8-flash",
      name: "Qwen: Qwen3.8 Flash",
      pricing: { prompt: "0.00000015", completion: "0.00000047" },
    },
    {
      id: "deepseek/deepseek-v4-flash",
      name: "DeepSeek: DeepSeek V4 Flash 0423",
      pricing: { prompt: "0.000000091", completion: "0.000000182" },
    },
  ],
};

/** Fake OpenAI-compatible server; records every request. */
function fakeServer(options: { chatStatus?: number; reply?: string } = {}) {
  const calls: { url: string; init?: RequestInit | undefined }[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith("/models")) return json(MODELS);
    if (url.endsWith("/chat/completions")) {
      if (options.chatStatus && options.chatStatus !== 200) {
        return json({ error: { message: "No auth credentials found" } }, options.chatStatus);
      }
      return json({ choices: [{ message: { content: options.reply ?? "OK" } }] });
    }
    return json({}, 404);
  }) as typeof fetch;
  return { fetchImpl, calls };
}

describe("provider helpers", () => {
  it("reads model names and per-million prices from the provider", () => {
    const models = parseModelList(MODELS);
    expect(models[1]).toMatchObject({ id: "qwen/qwen3.8-flash", name: "Qwen: Qwen3.8 Flash" });
    expect(formatPrice(models[1])).toBe("$0.15 in · $0.47 out");
    expect(formatPrice({ id: "x", name: "x" })).toBeNull();
    expect(parseModelList({ nope: true })).toEqual([]);
  });

  it("accepts only https server addresses, or http on localhost", () => {
    expect(checkBaseUrl("https://openrouter.ai/api/v1")).toBeNull();
    expect(checkBaseUrl("http://localhost:4000/v1")).toBeNull();
    expect(checkBaseUrl("http://example.com/v1")).toMatch(/must start with https/);
    expect(checkBaseUrl("")).toMatch(/Enter the server address/);
  });

  it("sends the key only to the configured server, as a bearer token", async () => {
    const { fetchImpl, calls } = fakeServer();
    const settings = {
      baseUrl: "https://openrouter.ai/api/v1/",
      model: "qwen/qwen3.8-flash",
      apiKey: " sk-or-v1-abc ",
    };
    const result = await testConnection("openrouter", settings, fetchImpl);
    expect(result).toEqual({ ok: true, reply: "OK" });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect((calls[0]!.init!.headers as Record<string, string>)["Authorization"]).toBe(
      "Bearer sk-or-v1-abc",
    );
  });

  it("explains rejected keys and unreachable servers", async () => {
    const settings = { baseUrl: "https://openrouter.ai/api/v1", model: "m", apiKey: "bad" };
    const rejected = await testConnection(
      "openrouter",
      settings,
      fakeServer({ chatStatus: 401 }).fetchImpl,
    );
    expect(rejected).toEqual({
      ok: false,
      error: "HTTP 401 — The key was rejected. — No auth credentials found",
    });
    const offline = await testConnection(
      "litellm",
      { ...settings, baseUrl: "https://proxy.example/v1" },
      (() => Promise.reject(new TypeError("Failed to fetch"))) as typeof fetch,
    );
    expect(offline.ok).toBe(false);
    if (!offline.ok) expect(offline.error).toMatch(/Could not reach proxy\.example.*CORS/);
  });

  it("does not call a provider that needs a key before one is entered", async () => {
    const { fetchImpl, calls } = fakeServer();
    const result = await listModels(
      "groq",
      { baseUrl: "https://api.groq.com/openai/v1", model: "", apiKey: "" },
      fetchImpl,
    );
    expect(result).toEqual({ ok: false, error: "Enter your Groq key to load models." });
    expect(calls).toHaveLength(0);
  });
});

describe("saved AI settings", () => {
  it("drops keys from storage unless 'Remember on this device' is on", () => {
    const settings = defaultAiSettings();
    settings.providers.openrouter.apiKey = "sk-or-v1-secret";
    expect(JSON.stringify(toStored(settings))).not.toContain("sk-or-v1-secret");
    expect(JSON.stringify(toStored({ ...settings, remember: true }))).toContain("sk-or-v1-secret");
  });

  it("ignores a stored key when remember is off, and survives malformed data", () => {
    const stored = JSON.stringify({
      provider: "groq",
      remember: false,
      providers: {
        groq: { baseUrl: "https://api.groq.com/openai/v1", model: "m", apiKey: "gsk_leak" },
      },
    });
    const loaded = fromStored(stored);
    expect(loaded.provider).toBe("groq");
    expect(loaded.providers.groq.apiKey).toBe("");
    expect(loaded.providers.groq.model).toBe("m");
    expect(fromStored("{broken")).toEqual(defaultAiSettings());
  });
});

describe("Your AI key section", () => {
  beforeEach(() => window.localStorage.clear());

  it("shows quick picks with live prices and selects a model", async () => {
    const { fetchImpl } = fakeServer();
    render(<PdpStudio aiFetch={fetchImpl} />);
    const panel = screen.getByLabelText("Your AI key");
    const picks = within(panel).getByRole("group", { name: "Quick model picks" });

    expect(await within(picks).findByText("$0.15 in · $0.47 out")).toBeInTheDocument();
    expect(within(picks).getByText("Qwen3.8 Flash")).toBeInTheDocument();
    expect(within(picks).getByText("DeepSeek V4 Flash 0423")).toBeInTheDocument();
    // In the quick-pick list but not offered by the (fake) provider: said so, not invented.
    expect(within(picks).getAllByText("not in the current list").length).toBeGreaterThan(0);

    fireEvent.click(within(picks).getByRole("button", { name: /DeepSeek V4 Flash 0423/ }));
    expect(within(panel).getByLabelText("Model")).toHaveValue("deepseek/deepseek-v4-flash");
  });

  it("tests the connection and reports success or the provider's error", async () => {
    render(<PdpStudio aiFetch={fakeServer().fetchImpl} />);
    const panel = screen.getByLabelText("Your AI key");
    fireEvent.change(within(panel).getByLabelText("OpenRouter key"), {
      target: { value: "sk-or-v1-test" },
    });
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: "Test connection" }));
    });
    expect(await within(panel).findByRole("status")).toHaveTextContent(
      'Connected — qwen/qwen3.8-flash replied "OK"',
    );
  });

  it("shows the error when the key is rejected", async () => {
    render(<PdpStudio aiFetch={fakeServer({ chatStatus: 401 }).fetchImpl} />);
    const panel = screen.getByLabelText("Your AI key");
    fireEvent.change(within(panel).getByLabelText("OpenRouter key"), {
      target: { value: "sk-or-v1-bad" },
    });
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: "Test connection" }));
    });
    expect(await within(panel).findByRole("alert")).toHaveTextContent(
      "HTTP 401 — The key was rejected.",
    );
  });

  it("stores the key only when 'Remember on this device' is ticked", async () => {
    render(<PdpStudio aiFetch={fakeServer().fetchImpl} />);
    const panel = screen.getByLabelText("Your AI key");
    fireEvent.change(within(panel).getByLabelText("OpenRouter key"), {
      target: { value: "sk-or-v1-keepme" },
    });
    await waitFor(() =>
      expect(window.localStorage.getItem(AI_SETTINGS_KEY)).toContain("qwen/qwen3.8-flash"),
    );
    expect(window.localStorage.getItem(AI_SETTINGS_KEY)).not.toContain("sk-or-v1-keepme");
    expect(
      within(panel).getByText(/Not saved — you will need to enter the key again/),
    ).toBeInTheDocument();

    fireEvent.click(within(panel).getByRole("checkbox", { name: "Remember on this device" }));
    await waitFor(() =>
      expect(window.localStorage.getItem(AI_SETTINGS_KEY)).toContain("sk-or-v1-keepme"),
    );
  });

  it("never puts the key into an exported brief", async () => {
    render(<PdpStudio aiFetch={fakeServer().fetchImpl} />);
    fireEvent.change(screen.getByLabelText("OpenRouter key"), {
      target: { value: "sk-or-v1-noexport" },
    });
    await waitFor(() =>
      expect(window.localStorage.getItem("indiamart-pdp-studio:v1")).not.toBeNull(),
    );
    expect(window.localStorage.getItem("indiamart-pdp-studio:v1")).not.toContain(
      "sk-or-v1-noexport",
    );
  });
});
