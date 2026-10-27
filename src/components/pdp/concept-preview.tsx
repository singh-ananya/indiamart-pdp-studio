import { useEffect, useRef, useState } from "react";
import { BadgePercent, ImageIcon, MapPin, ShieldCheck, Sparkles, Star } from "lucide-react";
import type {
  BlockKind,
  Concept,
  DeviceMode,
  FoldMode,
  PdpContext,
  Product,
} from "@/lib/pdp/types";
import { buildSpecRows, formatPrice, splitHighlights } from "@/lib/pdp/specs";
import { BLOCK_LABELS } from "@/lib/pdp/concepts";
import { buildFoldReport, type FoldReport } from "@/lib/pdp/devices";
import { DEFAULT_VIEWPORTS, type Viewport } from "@/lib/pdp/studio-state";
import { DeviceFrame } from "@/components/pdp/device-frame";

/** Visible placeholder for data the user has not supplied. Never shows a made-up value. */
function MissingSlot({ children }: { children: string }) {
  return (
    <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
      {children}
    </p>
  );
}

interface BlockProps {
  kind: BlockKind;
  product: Product;
  ctx: PdpContext;
  mcat: string;
}

function Block({ kind, product, ctx, mcat }: BlockProps) {
  switch (kind) {
    case "gallery": {
      const [main, ...thumbs] = product.imageUrls;
      return (
        <div className="rounded-lg border bg-muted/40 p-2">
          <div className="grid grid-cols-4 gap-1">
            <div className="col-span-4 flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md border border-dashed bg-background">
              {main ? (
                <img
                  src={main}
                  alt={product.name || "Product image"}
                  className="size-full object-contain"
                  referrerPolicy="no-referrer"
                  loading="lazy"
                />
              ) : (
                <div className="flex flex-col items-center gap-1 text-muted-foreground">
                  <ImageIcon className="size-6" />
                  <span className="text-xs">No image URL provided</span>
                </div>
              )}
            </div>
            {thumbs.slice(0, 4).map((url) => (
              <div
                key={url}
                className="aspect-square overflow-hidden rounded-md border bg-background"
              >
                <img
                  src={url}
                  alt=""
                  className="size-full object-cover"
                  referrerPolicy="no-referrer"
                  loading="lazy"
                />
              </div>
            ))}
          </div>
        </div>
      );
    }
    case "title":
      return (
        <div className="space-y-0.5">
          <h4 className="text-base font-semibold leading-snug">{product.name}</h4>
          <p className="text-sm text-muted-foreground">
            {ctx.brand || "Brand (not set)"} · {ctx.category || mcat}
          </p>
        </div>
      );
    case "price": {
      const price = formatPrice(product.price, product.priceMax);
      if (!price) return <MissingSlot>Price not provided</MissingSlot>;
      return (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xl font-bold text-brand-orange">{price}</span>
          {product.unit.trim() && (
            <span className="text-xs text-muted-foreground">/ {product.unit.trim()}</span>
          )}
          {product.moq.trim() && (
            <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
              MOQ: {product.moq.trim()}
            </span>
          )}
        </div>
      );
    }
    case "cta":
      return (
        <div className="grid grid-cols-2 gap-2">
          <div className="flex h-11 items-center justify-center rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground">
            Get Best Price
          </div>
          <div className="flex h-11 items-center justify-center rounded-md border border-primary px-3 text-sm font-semibold text-primary">
            Contact Supplier
          </div>
        </div>
      );
    case "ratings": {
      if (ctx.sellerRating === undefined) {
        return <MissingSlot>Seller rating not provided (add sellerRating to context)</MissingSlot>;
      }
      const filled = Math.round(ctx.sellerRating);
      return (
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              className={
                i < filled
                  ? "size-4 fill-brand-orange text-brand-orange"
                  : "size-4 text-muted-foreground/40"
              }
            />
          ))}
          <span className="ml-1">
            {ctx.sellerRating.toFixed(1)} / 5
            {ctx.ratingCount !== undefined && ` (${ctx.ratingCount} ratings)`}
          </span>
        </div>
      );
    }
    case "offer":
      return (
        <div className="flex items-center gap-1.5 rounded-md bg-brand-orange-soft px-3 py-2 text-sm font-medium text-brand-orange">
          <BadgePercent className="size-4 shrink-0" />
          {ctx.offer || "Offer strip — add an offer in the JSON context"}
        </div>
      );
    case "highlights": {
      const items = [...splitHighlights(product.highlights), ...ctx.usps];
      if (items.length === 0) return <MissingSlot>No highlights provided</MissingSlot>;
      return (
        <ul className="space-y-1">
          {items.map((h, i) => (
            <li key={i} className="flex gap-1.5 text-sm">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-brand-orange" />
              <span>{h}</span>
            </li>
          ))}
        </ul>
      );
    }
    case "specs": {
      const rows = buildSpecRows(product.specs, ctx.isqAttributes);
      if (rows.length === 0) {
        return (
          <MissingSlot>
            Add ISQ / specs like &quot;Material: Steel&quot; in the product card
          </MissingSlot>
        );
      }
      return (
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <tbody>
              {rows.map((row) => (
                <tr key={row.name} className="border-b last:border-b-0">
                  <td className="w-2/5 bg-muted/50 px-3 py-2 font-medium">{row.name}</td>
                  {row.missing ? (
                    <td className="px-3 py-2 italic text-muted-foreground">Not provided</td>
                  ) : (
                    <td className="px-3 py-2">{row.value}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case "description":
      return (
        <p className="text-sm leading-relaxed text-muted-foreground">
          {product.description || "Product description (not set)."}
        </p>
      );
    case "trust": {
      const badges = [
        ctx.verifiedSupplier && "Verified supplier",
        ctx.gstVerified && "GST verified",
        ctx.responseRate !== undefined && `${ctx.responseRate}% response rate`,
      ].filter((b): b is string => Boolean(b));
      if (badges.length === 0) {
        return <MissingSlot>No trust signals provided (GST, verified, response rate)</MissingSlot>;
      }
      return (
        <div className="flex flex-wrap gap-1.5">
          {badges.map((label) => (
            <span
              key={label}
              className="inline-flex items-center gap-1 rounded-full border bg-muted/50 px-2.5 py-1 text-xs font-medium"
            >
              <ShieldCheck className="size-4 text-brand-orange" />
              {label}
            </span>
          ))}
        </div>
      );
    }
    case "seller":
      return (
        <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2.5">
          <div>
            <p className="text-sm font-semibold">{ctx.brand || "Seller name (not set)"}</p>
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="size-4" />
              {ctx.city || "City (not set)"}
              {ctx.memberSince && ` · Member since ${ctx.memberSince}`}
            </p>
          </div>
          <span className="rounded-md border border-primary px-3 py-1.5 text-xs font-semibold text-primary">
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
  viewport?: Viewport;
}

function FoldReportView({ report, fold }: { report: FoldReport; fold: number }) {
  const names = (kinds: BlockKind[]) => kinds.map((k) => BLOCK_LABELS[k]).join(", ");
  return (
    <div className="space-y-1 text-xs" aria-label="Fold report">
      <p>
        <span className="font-medium">Fully visible above the {fold}px fold:</span>{" "}
        {report.above.length > 0 ? names(report.above) : "none"}
      </p>
      {report.cut.length > 0 && (
        <p>
          <span className="font-medium">Cut by the fold:</span> {names(report.cut)}
        </p>
      )}
      {report.missedIntent.length > 0 ? (
        <p className="text-destructive">
          Planned for the first fold but not fully visible: {names(report.missedIntent)}
        </p>
      ) : (
        <p className="text-muted-foreground">
          Every block planned for the first fold is fully visible.
        </p>
      )}
    </div>
  );
}

export function ConceptPreview({
  concept,
  product,
  ctx,
  mcat,
  device,
  fold,
  viewport = DEFAULT_VIEWPORTS[device],
}: ConceptPreviewProps) {
  const isDesktop = device === "desktop";
  const galleryLeads = isDesktop && concept.firstFold[0] === "gallery";
  const firstColumn = galleryLeads ? concept.firstFold.slice(1) : concept.firstFold;
  const contentRef = useRef<HTMLDivElement>(null);
  const [report, setReport] = useState<FoldReport | null>(null);

  // Measure where each block really lands at this viewport size.
  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const measure = () => {
      const box = content.getBoundingClientRect();
      const scale = box.width > 0 ? box.width / viewport.width : 1;
      const positions = Array.from(content.querySelectorAll<HTMLElement>("[data-block]")).map(
        (el) => {
          const r = el.getBoundingClientRect();
          return {
            kind: el.dataset["block"] as BlockKind,
            top: (r.top - box.top) / scale,
            bottom: (r.bottom - box.top) / scale,
          };
        },
      );
      setReport(buildFoldReport(positions, viewport.height, concept.firstFold));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    // Images loading or text wrapping change heights; re-measure when they do.
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => observer.disconnect();
  }, [concept, product, ctx, mcat, device, viewport.width, viewport.height]);

  const block = (kind: BlockKind) => (
    <div key={kind} data-block={kind}>
      <Block kind={kind} product={product} ctx={ctx} mcat={mcat} />
    </div>
  );

  return (
    <div className="space-y-2">
      <DeviceFrame
        viewport={viewport}
        scrollable={fold === "full"}
        label={`${concept.name} preview, ${viewport.width} by ${viewport.height}`}
      >
        <div ref={contentRef} className="relative min-h-full bg-card">
          <div className="flex h-12 items-center justify-between bg-brand-orange px-4">
            <span className="text-sm font-bold tracking-tight text-primary-foreground">
              IndiaMART-style mock
            </span>
            <span className="truncate pl-2 text-xs text-primary-foreground/80">{mcat}</span>
          </div>
          <div className="space-y-3 p-4">
            {galleryLeads ? (
              <div className="flex gap-6">
                <div className="w-[55%] shrink-0">{block("gallery")}</div>
                <div className="flex min-w-0 flex-1 flex-col gap-3">{firstColumn.map(block)}</div>
              </div>
            ) : (
              firstColumn.map(block)
            )}
            {concept.below.map(block)}
          </div>
          {fold === "full" && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-destructive"
              style={{ top: viewport.height }}
            >
              <span className="absolute right-2 -translate-y-full rounded-t bg-destructive px-1.5 py-0.5 text-xs font-medium text-white">
                Fold {viewport.height}px
              </span>
            </div>
          )}
        </div>
      </DeviceFrame>
      <p className="text-center text-xs text-muted-foreground">
        {fold === "full"
          ? "Scroll inside the frame. The dashed line marks the fold."
          : "First fold: the frame shows exactly what fits on screen before scrolling."}
      </p>
      {report && <FoldReportView report={report} fold={viewport.height} />}
    </div>
  );
}
