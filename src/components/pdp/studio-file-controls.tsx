import { useRef, useState } from "react";
import { Download, RotateCcw, Upload } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { SaveStatus } from "@/hooks/use-pdp-studio";
import { exportStudioFile, type ImportResult, type StudioState } from "@/lib/pdp/studio-state";

interface StudioFileControlsProps {
  state: StudioState;
  saveStatus: SaveStatus;
  onImportText: (text: string) => ImportResult;
  onReset: () => void;
}

type Message = { kind: "error" | "success"; title: string; lines: string[] } | null;

function slug(text: string) {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "brief"
  );
}

/** FileReader works in older mobile browsers that lack Blob.text(). */
function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file"));
    reader.readAsText(file);
  });
}

export function StudioFileControls({
  state,
  saveStatus,
  onImportText,
  onReset,
}: StudioFileControlsProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<Message>(null);

  const handleExport = () => {
    const result = exportStudioFile(state);
    if (!result.ok) {
      setMessage({ kind: "error", title: "Export not created", lines: [result.error] });
      return;
    }
    const url = URL.createObjectURL(new Blob([result.text], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `pdp-studio-${slug(state.mcat)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setMessage({ kind: "success", title: "Brief exported", lines: [] });
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    let text: string;
    try {
      text = await readFileText(file);
    } catch (error) {
      setMessage({
        kind: "error",
        title: `${file.name} could not be read — your current brief is unchanged`,
        lines: [error instanceof Error ? error.message : "Unknown read error"],
      });
      return;
    }
    const result = onImportText(text);
    setMessage(
      result.ok
        ? { kind: "success", title: `Imported ${file.name}`, lines: result.data.notes }
        : {
            kind: "error",
            title: `${file.name} was not imported — your current brief is unchanged`,
            lines: result.errors,
          },
    );
    if (fileInput.current) fileInput.current.value = "";
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          aria-label="Import brief JSON file"
          onChange={(event) => void handleFile(event.target.files?.[0])}
        />
        <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
          <Upload className="size-3.5" />
          Import JSON
        </Button>
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="size-3.5" />
          Export JSON
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm">
              <RotateCcw className="size-3.5" />
              Reset to demo
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Replace your brief with demo data?</AlertDialogTitle>
              <AlertDialogDescription>
                Your MCAT, context, product cards, notes and preferred concept will be replaced.
                Export first if you want to keep them.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep my brief</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  onReset();
                  setMessage(null);
                }}
              >
                Reset to demo
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <span className="text-xs text-muted-foreground" role="status">
          {saveStatus === "saved" && "Saved in this browser"}
          {saveStatus === "unavailable" && "Browser storage unavailable — export to keep your work"}
        </span>
      </div>
      {message && (
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
      )}
    </div>
  );
}
