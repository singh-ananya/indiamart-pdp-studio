import { useEffect, useId, useState } from "react";
import { KeyRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { useAiSettings } from "@/hooks/use-ai-settings";
import {
  AI_PROVIDER_IDS,
  AI_PROVIDERS,
  formatPrice,
  listModels,
  OPENROUTER_QUICK_PICKS,
  testConnection,
  type ModelInfo,
} from "@/lib/ai/providers";

type Status = { kind: "ok" | "error" | "busy"; text: string } | null;

interface AiKeyPanelProps {
  ai: ReturnType<typeof useAiSettings>;
  /** Injected in tests; defaults to the browser's fetch. */
  fetchImpl?: typeof fetch | undefined;
}

export function AiKeyPanel({ ai, fetchImpl }: AiKeyPanelProps) {
  const { settings, active, setProvider, updateActive, setRemember } = ai;
  const provider = settings.provider;
  const info = AI_PROVIDERS[provider];
  const ids = useId();
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const doFetch = fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));

  // Live model list (names and prices) from the provider; re-read when the address or key changes.
  const needsKey = info.modelsNeedKey;
  const keyForList = needsKey ? active.apiKey : "";
  useEffect(() => {
    let cancelled = false;
    setModels([]);
    setModelsError(null);
    if (needsKey && !keyForList.trim()) return;
    const handle = window.setTimeout(() => {
      void listModels(provider, { ...active, apiKey: keyForList }, doFetch).then((result) => {
        if (cancelled) return;
        if (result.ok) setModels(result.models);
        else setModelsError(result.error);
      });
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
    // `active`/`doFetch` change identity often; the inputs that matter are listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, active.baseUrl, keyForList, needsKey]);

  // Any edit makes an earlier test result stale.
  useEffect(() => setStatus(null), [provider, active.baseUrl, active.apiKey, active.model]);

  const byId = new Map(models.map((m) => [m.id, m]));

  const runTest = async () => {
    setStatus({ kind: "busy", text: "Testing…" });
    const result = await testConnection(provider, active, doFetch);
    setStatus(
      result.ok
        ? {
            kind: "ok",
            text: `Connected — ${active.model.trim()} replied ${result.reply ? `"${result.reply}"` : "(empty reply, but the request worked)"}`,
          }
        : { kind: "error", text: result.error },
    );
  };

  return (
    <Card aria-label="Your AI key">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="size-4 text-brand-orange" />
            Your AI key
          </CardTitle>
          <div
            className="inline-flex rounded-lg border bg-muted p-0.5"
            role="group"
            aria-label="AI provider"
          >
            {AI_PROVIDER_IDS.map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={provider === id}
                onClick={() => setProvider(id)}
                className={
                  provider === id
                    ? "rounded-md bg-background px-3 py-1.5 text-xs font-medium shadow-sm"
                    : "rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground"
                }
              >
                {AI_PROVIDERS[id].label}
              </button>
            ))}
          </div>
        </div>
        <CardDescription>
          Used to research benchmark pages. Your key stays in this browser and is sent only to the
          server address below — never to Supabase and never in exported briefs.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label
              htmlFor={`${ids}-key`}
              className="text-xs uppercase tracking-wide text-muted-foreground"
            >
              {info.keyLabel}
            </Label>
            <Input
              id={`${ids}-key`}
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={active.apiKey}
              onChange={(e) => updateActive({ apiKey: e.target.value })}
              placeholder={info.keyPlaceholder}
              className="font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label
              htmlFor={`${ids}-url`}
              className="text-xs uppercase tracking-wide text-muted-foreground"
            >
              Server address
            </Label>
            <Input
              id={`${ids}-url`}
              value={active.baseUrl}
              onChange={(e) => updateActive({ baseUrl: e.target.value })}
              placeholder={
                provider === "litellm" ? "https://your-litellm-proxy/v1" : info.defaultBaseUrl
              }
              className="font-mono"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label
            htmlFor={`${ids}-model`}
            className="text-xs uppercase tracking-wide text-muted-foreground"
          >
            Model
          </Label>
          <Input
            id={`${ids}-model`}
            list={`${ids}-models`}
            value={active.model}
            onChange={(e) => updateActive({ model: e.target.value })}
            placeholder="Type or pick a model id"
            className="font-mono"
          />
          <datalist id={`${ids}-models`}>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </datalist>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {modelsError
              ? modelsError
              : models.length > 0
                ? `${models.length} models available from ${info.label}${byId.get(active.model.trim()) ? ` · ${formatPrice(byId.get(active.model.trim())) ?? "price not published"}${formatPrice(byId.get(active.model.trim())) ? " per 1M tokens" : ""}` : ""}`
                : needsKey && !active.apiKey.trim()
                  ? `Enter your ${info.keyLabel} to load the model list.`
                  : "Loading the model list…"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            disabled={status?.kind === "busy"}
            onClick={() => void runTest()}
          >
            Test connection
          </Button>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={settings.remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="size-4"
            />
            Remember on this device
          </label>
          {status && (
            <span
              role={status.kind === "error" ? "alert" : "status"}
              className={
                status.kind === "ok"
                  ? "text-sm text-emerald-700 dark:text-emerald-400"
                  : status.kind === "error"
                    ? "text-sm text-destructive"
                    : "text-sm text-muted-foreground"
              }
            >
              {status.text}
            </span>
          )}
        </div>
        {!settings.remember && active.apiKey && (
          <p className="text-xs text-muted-foreground">
            Not saved — you will need to enter the key again after reloading the page.
          </p>
        )}

        {provider === "openrouter" && (
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">
              Quick picks · live prices from OpenRouter, US dollars per 1M tokens
            </p>
            <div
              className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5"
              role="group"
              aria-label="Quick model picks"
            >
              {OPENROUTER_QUICK_PICKS.map((id, index) => {
                const model = byId.get(id);
                const selected = active.model.trim() === id;
                const price = formatPrice(model);
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => updateActive({ model: id })}
                    className={`rounded-lg border p-3 text-left text-xs transition-colors ${
                      selected ? "border-primary bg-primary/5" : "bg-card hover:bg-muted/50"
                    }`}
                  >
                    <span className="flex flex-wrap items-center gap-1.5">
                      {index === 0 && <Badge variant="secondary">Default</Badge>}
                      <span className="text-sm font-semibold">
                        {model ? model.name.replace(/^[^:]+:\s*/, "") : id}
                      </span>
                    </span>
                    <span className="mt-1 block font-mono text-muted-foreground">
                      {price ?? (models.length > 0 ? "not in the current list" : "price loading…")}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
