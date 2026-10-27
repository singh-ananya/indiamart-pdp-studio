import {
  BadgePercent,
  ImageIcon,
  MapPin,
  ShieldCheck,
  Sparkles,
  Star,
} from "lucide-react";
import type {
  BlockKind,
  Concept,
  DeviceMode,
  FoldMode,
  PdpContext,
  Product,
} from "@/lib/pdp/types";

interface BlockProps {
  kind: BlockKind;
  product: Product;
  ctx: PdpContext;
  mcat: string;
}

function Block({ kind, product, ctx, mcat }: BlockProps) {
  switch (kind) {
    case "gallery":
      return (
        <div className="rounded-lg border bg-muted/40 p-2">
          <div className="grid grid-cols-3 gap-1">
            <div className="col-span-3 flex aspect-[4/3] items-center justify-center rounded-md border border-dashed bg-background">
              <div className="flex flex-col items-center gap-1 text-muted-foreground">
                <ImageIcon className="size-5" />
                <span className="text-[10px]">Demo image placeholder</span>
              </div>
            </div>
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="flex aspect-square items-center justify-center rounded-md border border-dashed bg-background"
              >
                <ImageIcon className="size-3.5 text-muted-foreground" />
              </div>
            ))}
          </div>
        </div>
      );
    case "title":
      return (
        <div className="space-y-0.5">
          <h4 className="text-sm font-semibold leading-tight">{product.name}</h4>
          <p className="text-[11px] text-muted-foreground">
            {ctx.brand || "Brand (not set)"} · {ctx.category || mcat}
          </p>
        </div>
      );
    case "price":
      return (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-lg font-bold text-brand-orange">
            ₹{product.price}
          </span>
          <span className="text-[10px] text-muted-foreground">/ piece</span>
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground">
            MOQ: {product.moq}
          </span>
          <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
            Get Best Price
          </span>
        </div>
      );
    case "cta":
      return (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-md bg-primary px-3 py-1.5 text-center text-[11px] font-semibold text-primary-foreground">
            Get Best Price
          </div>
          <div className="rounded-md border border-primary px-3 py-1.5 text-center text-[11px] font-semibold text-primary">
            Contact Supplier
          </div>
        </div>
      );
    case "ratings":
      return (
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              className={i < 4 ? "size-3 fill-brand-orange text-brand-orange" : "size-3 text-muted-foreground/40"}
            />
          ))}
          <span className="ml-1">4.3 / 5 (demo rating)</span>
        </div>
      );
    case "offer":
      return (
        <div className="flex items-center gap-1.5 rounded-md bg-brand-orange-soft px-2 py-1 text-[11px] font-medium text-brand-orange">
          <BadgePercent className="size-3.5 shrink-0" />
          {ctx.offer || "Offer strip — add an offer in the JSON context"}
        </div>
      );
    case "highlights": {
      const items = [
        ...product.highlights
          .split(/\n|,/)
          .map((h) => h.trim())
          .filter(Boolean),
        ...ctx.usps,
      ];
      return (
        <ul className="space-y-1">
          {items.map((h, i) => (
            <li key={i} className="flex gap-1.5 text-[11px]">
              <Sparkles className="mt-0.5 size-3 shrink-0 text-brand-orange" />
              <span>{h}</span>
            </li>
          ))}
        </ul>
      );
    }
    case "specs": {
      const rows = product.specs
        .split("\n")
        .map((line) => line.split(/:(.*)/))
        .filter((parts) => parts[0]?.trim() && parts[1]?.trim());
      if (rows.length === 0) {
        return (
          <p className="text-[11px] text-muted-foreground">
            Add specs like &quot;Material: Steel&quot; in the product card.
          </p>
        );
      }
      return (
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-[11px]">
            <tbody>
              {rows.map(([k, v], i) => (
                <tr key={i} className="border-b last:border-b-0">
                  <td className="w-1/3 bg-muted/50 px-2 py-1 font-medium">
                    {k.trim()}
                  </td>
                  <td className="px-2 py-1">{v.trim()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case "description":
      return (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {product.description || "Product description (not set)."}
        </p>
      );
    case "trust":
      return (
        <div className="flex flex-wrap gap-1.5">
          {["Supplier verified (demo)", "Secure payments (demo)", "Replacement policy (demo)"].map(
            (label) => (
              <span
                key={label}
                className="inline-flex items-center gap-1 rounded-full border bg-muted/50 px-2 py-0.5 text-[10px] font-medium"
              >
                <ShieldCheck className="size-3 text-brand-orange" />
                {label}
              </span>
            ),
          )}
        </div>
      );
    case "seller":
      return (
        <div className="flex items-center justify-between rounded-md border bg-muted/40 px-2.5 py-2">
          <div>
            <p className="text-[11px] font-semibold">{ctx.brand || "Seller name (not set)"}</p>
            <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <MapPin className="size-3" />
              {ctx.city || "City (not set)"} · member since 2017 (demo)
            </p>
          </div>
          <span className="rounded-md border border-primary px-2 py-1 text-[10px] font-semibold text-primary">
            View Profile
          </span>
        </div>
      );
  }
}

interface ConceptPreviewProps {
  concept: Concept;
  product: Product;
  ctx: PdpContext;
  mcat: string;
  device: DeviceMode;
  fold: FoldMode;
}

export function ConceptPreview({
  concept,
  product,
  ctx,
  mcat,
  device,
  fold,
}: ConceptPreviewProps) {
  const isDesktop = device === "desktop";
  const galleryLeads = concept.firstFold[0] === "gallery";
  const rest = galleryLeads ? concept.firstFold.slice(1) : concept.firstFold;

  const showFoldDivider = fold === "full";
  const belowBlocks = fold === "full" ? concept.below : [];

  return (
    <div
      className={
        isDesktop
          ? "overflow-hidden rounded-xl border-2 border-border bg-card"
          : "mx-auto max-w-[360px] overflow-hidden rounded-xl border-2 border-border bg-card"
      }
    >
      <div className="flex items-center justify-between bg-brand-orange px-3 py-1.5">
        <span className="text-[11px] font-bold tracking-tight text-primary-foreground">
          IndiaMART-style mock
        </span>
        <span className="text-[9px] text-primary-foreground/80">{mcat}</span>
      </div>
      <div className="space-y-2.5 p-3">
        {isDesktop ? (
          <div className="flex gap-4">
            {galleryLeads && (
              <div className="w-[55%] shrink-0">
                <Block kind="gallery" product={product} ctx={ctx} mcat={mcat} />
              </div>
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-2.5">
              {rest.map((kind) => (
                <Block key={kind} kind={kind} product={product} ctx={ctx} mcat={mcat} />
              ))}
            </div>
          </div>
        ) : (
          concept.firstFold.map((kind) => (
            <Block key={kind} kind={kind} product={product} ctx={ctx} mcat={mcat} />
          ))
        )}

        {showFoldDivider ? (
          <div className="flex items-center gap-2 py-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">
            <span className="h-px flex-1 border-t border-dashed" />
            First fold ends here
            <span className="h-px flex-1 border-t border-dashed" />
          </div>
        ) : (
          <p className="border-t border-dashed pt-2 text-center text-[9px] uppercase tracking-wide text-muted-foreground">
            First Fold view — below-the-fold blocks hidden
          </p>
        )}

        {belowBlocks.map((kind) => (
          <Block key={kind} kind={kind} product={product} ctx={ctx} mcat={mcat} />
        ))}
      </div>
    </div>
  );
}
