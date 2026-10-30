import { useRef, useState, type FormEvent } from "react";
import { Database, LogOut, Mail, RefreshCw, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { ActiveMcatConfig, useMcatConfig } from "@/hooks/use-mcat-config";
import {
  getMcatImageContext,
  IMAGE_CONTEXT_LABELS,
  levelText,
  type McatRankingEntry,
} from "@/lib/pdp/mcat-config";

type Message = { kind: "error" | "success"; title: string; lines: string[] } | null;

/** FileReader works in older mobile browsers that lack Blob.arrayBuffer(). */
function readFileBytes(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(
        reader.result instanceof ArrayBuffer ? new Uint8Array(reader.result) : new Uint8Array(),
      );
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file"));
    reader.readAsArrayBuffer(file);
  });
}

function formatDate(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

function Notice({ message }: { message: NonNullable<Message> }) {
  return (
    <div
      role={message.kind === "error" ? "alert" : "status"}
      className={
        message.kind === "error"
          ? "rounded-md border border-destructive/50 px-3 py-2 text-xs text-destructive"
          : "rounded-md border px-3 py-2 text-xs"
      }
    >
      <p className="font-medium">{message.title}</p>
      {message.lines.length > 0 && (
        <ul className="mt-1 list-inside list-disc">
          {message.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

const ORIGIN_TEXT: Record<ActiveMcatConfig["origin"], string> = {
  cache: "from this browser's cache",
  download: "downloaded from Supabase",
  upload: "uploaded from this browser",
};

function SignInForm({ onSend }: { onSend: McatConfigPanelProps["mcat"]["sendSignInLink"] }) {
  const [address, setAddress] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSending(true);
    const result = await onSend(address);
    setSending(false);
    setMessage(
      result.ok
        ? {
            kind: "success",
            title: `Sign-in link sent to ${address.trim()}`,
            lines: ["Open it in this browser to continue."],
          }
        : { kind: "error", title: "Sign-in link not sent", lines: [result.error] },
    );
  };

  return (
    <form className="space-y-2" onSubmit={(event) => void submit(event)}>
      <p className="text-muted-foreground">
        Sign in with your @indiamart.com email to use the shared MCAT configuration.
      </p>
      <div className="flex flex-wrap gap-2">
        <Input
          type="email"
          required
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          placeholder="name@indiamart.com"
          aria-label="Work email"
          className="max-w-xs"
        />
        <Button type="submit" size="sm" disabled={sending}>
          <Mail className="size-3.5" />
          {sending ? "Sending…" : "Email me a sign-in link"}
        </Button>
      </div>
      {message && <Notice message={message} />}
    </form>
  );
}

interface McatConfigPanelProps {
  mcat: ReturnType<typeof useMcatConfig>;
}

export function McatConfigPanel({ mcat }: McatConfigPanelProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<"idle" | "reading" | "uploading">("idle");
  const [message, setMessage] = useState<Message>(null);
  const { active, status } = mcat;
  const unchanged = active
    ? "the current configuration is unchanged"
    : "no configuration was activated";

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setMessage(null);
    setPhase("reading");
    try {
      let bytes: Uint8Array;
      try {
        bytes = await readFileBytes(file);
      } catch (error) {
        setMessage({
          kind: "error",
          title: `${file.name} could not be read — ${unchanged}`,
          lines: [error instanceof Error ? error.message : "Unknown read error"],
        });
        return;
      }
      setPhase("uploading");
      const result = await mcat.upload(bytes, file.name);
      setMessage(
        result.ok
          ? {
              kind: "success",
              title: `${file.name} is now the active MCAT configuration for everyone`,
              lines: [
                `${result.active.config.mcatCount.toLocaleString()} MCATs.`,
                ...result.active.config.warnings,
              ],
            }
          : {
              kind: "error",
              title: `${file.name} was not applied — ${unchanged}`,
              lines: result.errors,
            },
      );
    } finally {
      setPhase("idle");
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const signedIn = mcat.email !== null && status !== "wrong-account";

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="size-4 text-brand-orange" />
            MCAT configuration
          </CardTitle>
          {active && <Badge variant="secondary">Shared · from Supabase</Badge>}
          {(status === "loading" || mcat.checking) && <Badge variant="outline">Checking…</Badge>}
        </div>
        <CardDescription>
          The im-lite MCAT master file (mcatcontext.json), shared by everyone using the studio. It
          ranks how much buyers of each MCAT care about image, specification, price, company and
          unit. It contains no product data or image URLs.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {status === "not-configured" && (
          <p className="text-muted-foreground">
            Supabase is not configured for this build, so the MCAT configuration is unavailable. Set
            VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (see README).
          </p>
        )}
        {status === "signed-out" && <SignInForm onSend={mcat.sendSignInLink} />}
        {status === "wrong-account" && (
          <p role="alert" className="text-destructive">
            Signed in as {mcat.email}. Only @indiamart.com accounts can use the MCAT configuration.
          </p>
        )}
        {signedIn && (
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            Signed in as {mcat.email}
            <Button variant="ghost" size="sm" onClick={() => void mcat.signOut()}>
              <LogOut className="size-3.5" />
              Sign out
            </Button>
          </p>
        )}
        {status === "empty" && (
          <p className="text-muted-foreground">
            No MCAT configuration has been uploaded yet. Upload mcatcontext.json to share it with
            the team.
          </p>
        )}
        {mcat.errors.length > 0 && (
          <Notice
            message={{ kind: "error", title: mcat.errors[0]!, lines: mcat.errors.slice(1) }}
          />
        )}
        {mcat.notice && <Notice message={{ kind: "success", title: mcat.notice, lines: [] }} />}
        {active && (
          <dl
            className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[auto_1fr]"
            aria-label="Active MCAT configuration"
          >
            <dt className="font-medium text-muted-foreground">File</dt>
            <dd>{active.version.fileName}</dd>
            <dt className="font-medium text-muted-foreground">Version</dt>
            <dd>{active.version.version || "not stated in the file"}</dd>
            <dt className="font-medium text-muted-foreground">MCATs</dt>
            <dd>{active.config.mcatCount.toLocaleString()}</dd>
            <dt className="font-medium text-muted-foreground">Uploaded</dt>
            <dd>
              {formatDate(active.version.uploadedAt)} by {active.version.uploadedBy}
            </dd>
            <dt className="font-medium text-muted-foreground">SHA-256</dt>
            <dd className="font-mono" title={active.version.sha256}>
              {active.version.sha256.slice(0, 12)}… ({ORIGIN_TEXT[active.origin]})
            </dd>
          </dl>
        )}
        {active && active.config.warnings.length > 0 && (
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">
              {active.config.warnings.length} kind(s) of unrecognised value in the file — kept as
              written, not corrected
            </summary>
            <ul className="mt-1 list-inside list-disc">
              {active.config.warnings.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </details>
        )}
        {signedIn && status !== "loading" && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              aria-label="MCAT configuration JSON file"
              onChange={(event) => void handleFile(event.target.files?.[0])}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={phase !== "idle"}
              onClick={() => fileInput.current?.click()}
            >
              <Upload className="size-3.5" />
              {phase === "reading"
                ? "Reading…"
                : phase === "uploading"
                  ? "Validating and uploading…"
                  : active
                    ? "Replace with updated JSON"
                    : "Upload MCAT JSON"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={mcat.checking || phase !== "idle"}
              onClick={() => void mcat.refresh()}
            >
              <RefreshCw className="size-3.5" />
              Check for updates
            </Button>
          </div>
        )}
        {message && <Notice message={message} />}
      </CardContent>
    </Card>
  );
}

interface McatRankingSummaryProps {
  mcatId: string;
  ranking: McatRankingEntry[] | null;
  active: ActiveMcatConfig | null;
}

/** The selected MCAT's ranking exactly as configured, shown once above the concepts. */
export function McatRankingSummary({ mcatId, ranking, active }: McatRankingSummaryProps) {
  if (!mcatId) {
    return (
      <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
        No MCAT ID set — enter one in the brief to check each concept against its MCAT
        configuration.
      </p>
    );
  }
  if (!active) {
    return (
      <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
        MCAT {mcatId}: no MCAT configuration loaded.
      </p>
    );
  }
  const source = `${active.version.fileName}${active.version.version ? `, version ${active.version.version}` : ""}`;
  if (!ranking) {
    return (
      <p
        role="alert"
        className="rounded-md border border-destructive/50 px-3 py-2 text-sm text-destructive"
      >
        MCAT {mcatId} is not in the active configuration ({source}).
      </p>
    );
  }
  const imageContext = getMcatImageContext(ranking);
  return (
    <Card aria-label={`MCAT ${mcatId} configuration`}>
      <CardContent className="space-y-3 pt-5 text-sm">
        <p className="font-medium">
          MCAT {mcatId} — importance ranking from {source}
        </p>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-1.5 font-medium">Rank</th>
                <th className="px-3 py-1.5 font-medium">Dimension</th>
                <th className="px-3 py-1.5 font-medium">Level</th>
                <th className="px-3 py-1.5 font-medium">Show</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((entry, i) => (
                <tr key={i} className="border-t">
                  <td className="px-3 py-1.5">{entry.raw.rank}</td>
                  <td className="px-3 py-1.5">
                    {entry.dimension ?? `"${entry.raw.dimension}" (unrecognised)`}
                  </td>
                  <td className="px-3 py-1.5">{levelText(entry)}</td>
                  <td className="px-3 py-1.5">{entry.raw.show}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs">
          <span className="font-medium">Image context:</span> {IMAGE_CONTEXT_LABELS[imageContext]}
        </p>
        <p className="text-xs text-muted-foreground">
          Each concept below reports where these dimensions land against its measured fold. The
          concept layouts themselves are not reordered, so the five stay comparable.
        </p>
      </CardContent>
    </Card>
  );
}
