import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { parseImageUrlText } from "@/lib/pdp/schema";

interface ImageUrlFieldProps {
  urls: string[];
  onChange: (urls: string[]) => void;
  label: string;
}

/**
 * One image URL per line. The draft text is kept locally so a half-typed URL
 * is not thrown away; only valid http(s) URLs are passed up to the product.
 * Remount with a new `key` to reset the draft after an import.
 */
export function ImageUrlField({ urls, onChange, label }: ImageUrlFieldProps) {
  const [draft, setDraft] = useState(() => urls.join("\n"));
  const { invalid } = parseImageUrlText(draft);

  return (
    <div className="space-y-1">
      <Textarea
        rows={2}
        className="font-mono text-xs"
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          onChange(parseImageUrlText(event.target.value).urls);
        }}
        placeholder={"Image URLs, one per line (optional)\nhttps://…"}
        aria-label={label}
        aria-invalid={invalid.length > 0}
      />
      {invalid.length > 0 && (
        <p className="text-xs text-destructive">
          Not used — not an http(s) URL: {invalid.join(", ")}
        </p>
      )}
    </div>
  );
}
