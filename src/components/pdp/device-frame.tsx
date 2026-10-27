import { useEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { fitScale } from "@/lib/pdp/devices";
import type { Viewport } from "@/lib/pdp/studio-state";

const BORDER = 2;

interface DeviceFrameProps {
  viewport: Viewport;
  /** Full PDP: scroll inside the frame. First fold: clip at the frame's bottom edge. */
  scrollable: boolean;
  viewportRef?: Ref<HTMLDivElement>;
  label: string;
  children: ReactNode;
}

/**
 * Renders children at the exact CSS viewport size, then scales the whole frame
 * down to fit the card. Layout happens at real size, so the frame's bottom edge
 * is the fold for that viewport.
 */
export function DeviceFrame({
  viewport,
  scrollable,
  viewportRef,
  label,
  children,
}: DeviceFrameProps) {
  const outer = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(0);

  useEffect(() => {
    const el = outer.current;
    if (!el) return;
    const update = () => setAvailable(el.clientWidth - BORDER * 2);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const scale = fitScale(available, viewport.width);

  return (
    <div ref={outer} className="w-full">
      <div
        className="mx-auto box-content overflow-hidden rounded-xl border-2 border-border bg-card"
        style={{ width: viewport.width * scale, height: viewport.height * scale }}
      >
        <div
          ref={viewportRef}
          role="region"
          aria-label={label}
          tabIndex={scrollable ? 0 : -1}
          className={
            scrollable
              ? "overflow-x-hidden overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              : "overflow-hidden"
          }
          style={{
            width: viewport.width,
            height: viewport.height,
            transform: scale === 1 ? undefined : `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          {children}
        </div>
      </div>
      <p className="mt-1.5 text-center text-xs text-muted-foreground">
        {viewport.width} × {viewport.height} px
        {scale < 1 && `, shown at ${Math.round(scale * 100)}%`}
      </p>
    </div>
  );
}
