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
import { buildSpecRows, formatPrice, keyIsqValues, splitHighlights } from "@/lib/pdp/specs";
import { BLOCK_LABELS } from "@/lib/pdp/concepts";
import { buildFoldReport, type FoldReport } from "@/lib/pdp/devices";
import {
  DIMENSION_BLOCKS,
  getMcatImageContext,
  levelText,
  placeMcatDimensions,
  type McatRankingEntry,
} from "@/lib/pdp/mcat-config";
import { DEFAULT_VIEWPORTS, type Viewport } from "@/lib/pdp/studio-state";
import { DeviceFrame } from "@/components/pdp/device-frame";
import { IM_STICKY_BAR_HEIGHT } from "@/lib/pdp/indiamart-design";

/** Visible placeholder for data the user has not supplied. Never shows a made-up value. */
function MissingSlot({ children }: { children: string }) {
  return <p className="im-missing">{children}</p>;
}

interface BlockProps {
  kind: BlockKind;
  product: Product;
  ctx: PdpContext;
  mcat: string;
  concept: Concept;
}

/** Trust signals: at most 2 badges per card (design guide); the rest as 11px text. */
function trustSignals(ctx: PdpContext) {
  const badges: { label: string; verified: boolean }[] = [];
  if (ctx.verifiedSupplier) badges.push({ label: "✓ Verified Supplier", verified: true });
  if (ctx.gstVerified) badges.push({ label: "GST Verified", verified: false });
  const text = ctx.responseRate !== undefined ? `Response Rate: ${ctx.responseRate}%` : "";
  return { badges: badges.slice(0, 2), text };
}

/**
 * One PDP block, styled with IndiaMART's Msite design system (`.im-pdp` in styles.css,
 * from im-lite's design_guides.md). Content is only ever the product's real data.
 */
function Block({ kind, product, ctx, mcat, concept }: BlockProps) {
  switch (kind) {
    case "gallery": {
      const [main, ...thumbs] = product.imageUrls;
      return (
        <div className="im-card" style={{ padding: 8 }}>
          <div className="grid grid-cols-4 gap-1">
            <div
              className="col-span-4 flex aspect-[4/3] items-center justify-center overflow-hidden"
              style={{ borderRadius: 12, background: "var(--im-card)" }}
            >
              {main ? (
                <img
                  src={main}
                  alt={product.name || "Product image"}
                  className="size-full object-contain"
                  referrerPolicy="no-referrer"
                  loading="lazy"
                />
              ) : (
                <div
                  className="flex flex-col items-center gap-1"
                  style={{ color: "var(--im-600)" }}
                >
                  <ImageIcon className="size-6" />
                  <span className="im-caption">No image provided</span>
                </div>
              )}
            </div>
            {thumbs.slice(0, 4).map((url) => (
              <div
                key={url}
                className="aspect-square overflow-hidden"
                style={{ borderRadius: 8, border: "1px solid var(--im-300)" }}
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
          <h4 className="im-title">{product.name}</h4>
          <p className="im-sub">
            {ctx.brand || "Brand (not set)"} · {ctx.category || mcat}
          </p>
        </div>
      );
    case "price": {
      const price = formatPrice(product.price, product.priceMax);
      if (!price) return <MissingSlot>Price not provided</MissingSlot>;
      return (
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="im-price">{price}</span>
          {product.unit.trim() && <span className="im-caption">/ {product.unit.trim()}</span>}
          {product.moq.trim() && <span className="im-caption">· MOQ: {product.moq.trim()}</span>}
        </div>
      );
    }
    case "cta":
      // Design guide: at most 2 CTAs; teal primary, teal outline secondary, 48px, 8px radius.
      return (
        <div className="grid grid-cols-2 gap-2">
          <div className="im-btn im-btn-primary">{concept.cta?.primary ?? "Get Best Price"}</div>
          <div className="im-btn im-btn-outline">
            {concept.cta?.secondary ?? "Contact Supplier"}
          </div>
        </div>
      );
    case "ratings": {
      if (ctx.sellerRating === undefined) {
        return <MissingSlot>Seller rating not provided (add sellerRating to context)</MissingSlot>;
      }
      const filled = Math.round(ctx.sellerRating);
      return (
        <div className="flex items-center gap-1" style={{ fontSize: 13 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              className="size-4"
              style={
                i < filled
                  ? { fill: "var(--im-trending)", color: "var(--im-trending)" }
                  : { color: "var(--im-300)" }
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
      return ctx.offer ? (
        <div className="im-offer flex items-center gap-1.5">
          <BadgePercent className="size-4 shrink-0" />
          {ctx.offer}
        </div>
      ) : (
        <MissingSlot>No offer provided (add offer to context)</MissingSlot>
      );
    case "highlights": {
      const keySpecs = keyIsqValues(product.specs, concept.keyIsq);
      const items = [...splitHighlights(product.highlights), ...ctx.usps];
      if (keySpecs.length === 0 && items.length === 0) {
        return <MissingSlot>No highlights provided</MissingSlot>;
      }
      return (
        <div className="space-y-2">
          {keySpecs.length > 0 && (
            <div className="flex flex-wrap gap-1.5" aria-label="Key specifications">
              {keySpecs.map((row) => (
                <span key={row.name} className="im-chip">
                  <span style={{ color: "var(--im-600)" }}>{row.name}:</span>{" "}
                  <span style={{ fontWeight: 600 }}>{row.value}</span>
                </span>
              ))}
            </div>
          )}
          {items.length > 0 && (
            <ul className="space-y-1">
              {items.map((h, i) => (
                <li key={i} className="flex gap-1.5" style={{ fontSize: 13 }}>
                  <Sparkles
                    className="mt-0.5 size-4 shrink-0"
                    style={{ color: "var(--im-primary)" }}
                  />
                  <span>{h}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    }
    case "specs": {
      const rows = buildSpecRows(product.specs, ctx.isqAttributes);
      if (rows.length === 0) {
        return <MissingSlot>No ISQ / specifications provided</MissingSlot>;
      }
      return (
        <div className="im-card" style={{ padding: 0, overflow: "hidden" }}>
          <table className="im-specs">
            <tbody>
              {rows.map((row) => (
                <tr key={row.name}>
                  <td>{row.name}</td>
                  {row.missing ? (
                    <td style={{ color: "var(--im-600)", fontStyle: "italic" }}>Not provided</td>
                  ) : (
                    <td>{row.value}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case "description":
      return product.description ? (
        <div className="im-card">
          <p style={{ fontSize: 13, lineHeight: 1.5 }}>{product.description}</p>
        </div>
      ) : (
        <MissingSlot>No description provided</MissingSlot>
      );
    case "trust": {
      const { badges, text } = trustSignals(ctx);
      if (badges.length === 0 && !text) {
        return <MissingSlot>No trust signals provided (GST, verified, response rate)</MissingSlot>;
      }
      return (
        <div className="flex flex-wrap items-center gap-1.5">
          {badges.map((b) => (
            <span
              key={b.label}
              className={b.verified ? "im-badge im-badge-verified" : "im-badge im-badge-neutral"}
            >
              {!b.verified && <ShieldCheck className="size-3" />}
              {b.label}
            </span>
          ))}
          {text && <span className="im-small">{text}</span>}
        </div>
      );
    }
    case "seller":
      return (
        <div className="im-card flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p style={{ fontSize: 14, fontWeight: 600 }}>{ctx.brand || "Seller name (not set)"}</p>
            <p className="im-sub flex items-center gap-1">
              <MapPin className="size-3.5 shrink-0" />
              {ctx.city || "City (not set)"}
              {ctx.memberSince && ` · Member since ${ctx.memberSince}`}
            </p>
          </div>
          <span className="im-btn im-btn-outline im-btn-small shrink-0">View Profile</span>
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
  /** Selected MCAT's importance ranking; omitted or null when there is none to check. */
  mcatRanking?: McatRankingEntry[] | null | undefined;
  /** Receives each measured fold report, e.g. for scoring. */
  onReport?: ((conceptId: string, report: FoldReport) => void) | undefined;
}

const PLACEMENT_TEXT = {
  above: "above the fold",
  "not-above": "below the fold",
  "not-in-layout": "not in this layout",
} as const;

/** How this concept places the MCAT's ranked dimensions, from the measured fold report. */
function McatPlacementView({
  ranking,
  concept,
  report,
  product,
}: {
  ranking: McatRankingEntry[];
  concept: Concept;
  report: FoldReport;
  product: Product;
}) {
  const placements = placeMcatDimensions(
    ranking,
    [...concept.firstFold, ...concept.below],
    report.above,
  );
  const imageContext = getMcatImageContext(ranking);
  return (
    <div
      className="space-y-1 rounded-md border bg-muted/30 px-3 py-2 text-xs"
      aria-label="MCAT priority check"
    >
      <p className="font-medium">MCAT priorities in this concept</p>
      <ul className="space-y-0.5">
        {placements.map(({ entry, status }, i) => {
          const missesHigh = entry.level === "high" && status !== "above";
          return (
            <li key={i} className={missesHigh ? "text-destructive" : undefined}>
              {entry.raw.rank}. {entry.dimension} ({levelText(entry)}): {PLACEMENT_TEXT[status]}
              {entry.dimension === "unit" && status !== "not-in-layout" && !product.unit.trim()
                ? " — shown in the price block, but this product has no unit"
                : ""}
              {entry.show === false && " · Show: No in the file"}
            </li>
          );
        })}
      </ul>
      {imageContext && DIMENSION_BLOCKS.image.some((b) => report.above.includes(b)) && (
        <p className="text-muted-foreground">
          Low-image MCAT: im-lite uses a different media block for it, so a gallery above the fold
          may not match production.
        </p>
      )}
    </div>
  );
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
  mcatRanking,
  onReport,
}: ConceptPreviewProps) {
  const isDesktop = device === "desktop";
  // Msite design guide: a 56px teal sticky action bar covers the bottom of the mobile
  // screen, so the visible fold ends above it.
  const stickyBar = !isDesktop;
  const foldHeight = viewport.height - (stickyBar ? IM_STICKY_BAR_HEIGHT : 0);
  const galleryLeads = isDesktop && concept.firstFold[0] === "gallery";
  const firstColumn = galleryLeads ? concept.firstFold.slice(1) : concept.firstFold;
  const contentRef = useRef<HTMLDivElement>(null);
  const [report, setReport] = useState<FoldReport | null>(null);
  // Kept in a ref so a new callback identity does not trigger re-measuring.
  const onReportRef = useRef(onReport);
  onReportRef.current = onReport;

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
      const next = buildFoldReport(positions, foldHeight, concept.firstFold);
      setReport(next);
      onReportRef.current?.(concept.id, next);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    // Images loading or text wrapping change heights; re-measure when they do.
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => observer.disconnect();
  }, [concept, product, ctx, mcat, device, viewport.width, viewport.height, foldHeight]);

  const block = (kind: BlockKind) => (
    <div key={kind} data-block={kind}>
      <Block kind={kind} product={product} ctx={ctx} mcat={mcat} concept={concept} />
    </div>
  );

  return (
    <div className="space-y-2">
      <DeviceFrame
        viewport={viewport}
        scrollable={fold === "full"}
        label={`${concept.name} preview, ${viewport.width} by ${viewport.height}`}
        overlay={
          stickyBar ? (
            <div
              className="im-pdp"
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                height: IM_STICKY_BAR_HEIGHT,
                background: "transparent",
              }}
            >
              <div className="im-sticky" aria-label="Sticky action bar">
                <span className="im-sticky-main">{concept.cta?.primary ?? "Get Best Price"}</span>
                {ctx.responseRate !== undefined && (
                  <span className="im-sticky-sub">Response Rate: {ctx.responseRate}%</span>
                )}
              </div>
            </div>
          ) : null
        }
      >
        <div ref={contentRef} className="im-pdp relative min-h-full">
          <div className="im-nav">
            <span className="im-logo">IndiaMART</span>
            <span className="im-nav-mcat">{mcat}</span>
          </div>
          <div
            className="im-body"
            style={stickyBar ? { paddingBottom: 12 + IM_STICKY_BAR_HEIGHT } : undefined}
          >
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
              style={{ top: foldHeight }}
            >
              <span className="absolute right-2 -translate-y-full rounded-t bg-destructive px-1.5 py-0.5 text-xs font-medium text-white">
                Fold {foldHeight}px
              </span>
            </div>
          )}
        </div>
      </DeviceFrame>
      <p className="text-center text-xs text-muted-foreground">
        {fold === "full"
          ? "Scroll inside the frame. The dashed line marks the fold."
          : "First fold: the frame shows exactly what fits on screen before scrolling."}
        {stickyBar &&
          ` The teal action bar covers the bottom ${IM_STICKY_BAR_HEIGHT}px, so the fold is at ${foldHeight}px.`}
      </p>
      {report && <FoldReportView report={report} fold={foldHeight} />}
      {report && mcatRanking && (
        <McatPlacementView
          ranking={mcatRanking}
          concept={concept}
          report={report}
          product={product}
        />
      )}
    </div>
  );
}
