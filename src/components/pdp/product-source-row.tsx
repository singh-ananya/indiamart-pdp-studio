import { useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SourceState } from "@/hooks/use-product-sources";
import { parseIndiaMartId, type IndiaMartSeller, type SearchMatch } from "@/lib/indiamart/product";
import type { Product } from "@/lib/pdp/types";

interface ProductSourceRowProps {
  index: number;
  product: Product;
  state: SourceState;
  onNameChange: (name: string) => void;
  onFind: () => void;
  onChoose: (displayId: string) => void;
  onUseSeller: (seller: IndiaMartSeller) => string | null;
}

function sellerLine(seller: IndiaMartSeller): string {
  return [
    seller.name || "Seller name not given",
    seller.city,
    seller.rating !== undefined
      ? `rating ${seller.rating}${seller.ratingCount !== undefined ? ` (${seller.ratingCount})` : ""}`
      : "",
    seller.gstVerified ? "GST verified" : "",
    seller.memberSince ? `on IndiaMART since ${seller.memberSince}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

const optionLabel = (m: SearchMatch) =>
  [m.title, m.company, m.price ? `₹${m.price}` : ""].filter(Boolean).join(" — ");

/** One product: its name, the IndiaMART listing found for it, and alternatives. */
export function ProductSourceRow({
  index,
  product,
  state,
  onNameChange,
  onFind,
  onChoose,
  onUseSeller,
}: ProductSourceRowProps) {
  const n = index + 1;
  const [link, setLink] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [sellerMessage, setSellerMessage] = useState<string | null>(null);
  const selected = state.matches.find((m) => m.displayId === state.selectedId);

  const applyLink = () => {
    const id = parseIndiaMartId(link);
    if (!id) {
      setLinkError("Paste an IndiaMART product URL (…-1234567890.html) or its numeric ID.");
      return;
    }
    setLinkError(null);
    onChoose(id);
  };

  return (
    <div className="space-y-1.5 rounded-md border p-2.5" aria-label={`Brief product ${n}`}>
      <div className="flex flex-wrap gap-2">
        <Input
          className="min-w-0 flex-1 basis-56"
          value={product.name}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder={`Product ${n} name`}
          aria-label={`Brief product ${n} name`}
        />
        <Button
          variant="outline"
          size="sm"
          className="h-9"
          disabled={state.busy || product.name.trim().length < 2}
          onClick={onFind}
        >
          <Search className="size-3.5" />
          {state.busy ? "Finding…" : "Find on IndiaMART"}
        </Button>
      </div>

      {state.error && (
        <p role="alert" className="text-xs text-destructive">
          {state.error}
        </p>
      )}

      {state.matches.length > 0 && (
        <div className="space-y-1">
          <label className="block text-xs text-muted-foreground">
            IndiaMART listing used ({state.matches.length} found, best match first)
            <select
              className="mt-0.5 block w-full rounded-md border bg-background px-2 py-1.5 text-xs text-foreground"
              value={state.selectedId ?? ""}
              disabled={state.busy}
              onChange={(event) => onChoose(event.target.value)}
              aria-label={`Product ${n} IndiaMART listing`}
            >
              {state.selectedId && !selected && (
                <option value={state.selectedId}>Listing {state.selectedId} (from link)</option>
              )}
              {state.matches.map((m) => (
                <option key={m.displayId} value={m.displayId}>
                  {optionLabel(m)}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {state.summary && (
        <div role="status" className="space-y-1 text-xs">
          <p>{state.summary}</p>
          {state.looseMatch && (
            <p className="text-amber-700 dark:text-amber-400">
              Closest listing found, but its title differs from your name — check it, or pick
              another listing above.
            </p>
          )}
          {state.mcatNote && <p className="text-amber-700 dark:text-amber-400">{state.mcatNote}</p>}
          {state.seller && (
            <p className="flex flex-wrap items-center gap-2 text-muted-foreground">
              <span>Seller: {sellerLine(state.seller)}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setSellerMessage(onUseSeller(state.seller!))}
              >
                Use as seller details
              </Button>
            </p>
          )}
          {sellerMessage && <p className="text-muted-foreground">{sellerMessage}</p>}
        </div>
      )}

      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">Use a specific IndiaMART listing instead</summary>
        <div className="mt-1.5 flex flex-wrap gap-2">
          <Input
            className="min-w-0 flex-1 basis-56"
            value={link}
            onChange={(event) => setLink(event.target.value)}
            placeholder="IndiaMART product URL or ID"
            aria-label={`Product ${n} IndiaMART URL or ID`}
            inputMode="url"
          />
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            disabled={!link.trim() || state.busy}
            onClick={applyLink}
          >
            Use this listing
          </Button>
        </div>
        {linkError && (
          <p role="alert" className="mt-1 text-destructive">
            {linkError}
          </p>
        )}
      </details>
    </div>
  );
}
