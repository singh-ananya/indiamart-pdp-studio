import type { BlockKind, DeviceMode } from "./types";
import type { Viewport } from "./studio-state";

export interface DevicePreset extends Viewport {
  id: string;
  device: DeviceMode;
  label: string;
}

/**
 * Common CSS viewport sizes. These are screen sizes: the area a buyer actually
 * sees is shorter once the status bar and the browser's address bar are shown,
 * so the height can be edited to match a measured device.
 */
export const DEVICE_PRESETS: DevicePreset[] = [
  { id: "m-360x640", device: "mobile", label: "Small Android", width: 360, height: 640 },
  { id: "m-360x800", device: "mobile", label: "Android", width: 360, height: 800 },
  { id: "m-390x844", device: "mobile", label: "iPhone 12–15", width: 390, height: 844 },
  { id: "m-412x915", device: "mobile", label: "Large Android", width: 412, height: 915 },
  { id: "d-1366x768", device: "desktop", label: "Laptop", width: 1366, height: 768 },
  { id: "d-1440x900", device: "desktop", label: "Laptop large", width: 1440, height: 900 },
  { id: "d-1920x1080", device: "desktop", label: "Full HD", width: 1920, height: 1080 },
];

export const VIEWPORT_LIMITS = {
  width: { min: 240, max: 3840 },
  height: { min: 320, max: 2400 },
} as const;

export function presetsFor(device: DeviceMode): DevicePreset[] {
  return DEVICE_PRESETS.filter((p) => p.device === device);
}

export function matchPreset(device: DeviceMode, viewport: Viewport): DevicePreset | undefined {
  return presetsFor(device).find((p) => p.width === viewport.width && p.height === viewport.height);
}

/** Scale that fits a viewport into the available width; never enlarges. */
export function fitScale(availableWidth: number, viewportWidth: number): number {
  if (availableWidth <= 0 || viewportWidth <= 0) return 1;
  return Math.min(1, availableWidth / viewportWidth);
}

export type FoldStatus = "above" | "cut" | "below";

/**
 * Browsers lay out on sub-pixel boundaries (e.g. a block ending at 640.5px).
 * Overflow of up to 1px is invisible to a buyer, so it is not reported as cut.
 */
export const FOLD_TOLERANCE_PX = 1;

/** Positions are CSS px from the top of the page, unscaled. */
export function classifyBlock(top: number, bottom: number, foldHeight: number): FoldStatus {
  if (bottom <= foldHeight + FOLD_TOLERANCE_PX) return "above";
  if (top < foldHeight) return "cut";
  return "below";
}

export interface BlockPosition {
  kind: BlockKind;
  top: number;
  bottom: number;
}

export interface FoldReport {
  above: BlockKind[];
  cut: BlockKind[];
  below: BlockKind[];
  /** Blocks the concept intends above the fold that are not fully visible. */
  missedIntent: BlockKind[];
}

export function buildFoldReport(
  positions: BlockPosition[],
  foldHeight: number,
  intendedFirstFold: BlockKind[],
): FoldReport {
  const report: FoldReport = { above: [], cut: [], below: [], missedIntent: [] };
  for (const pos of positions) {
    report[classifyBlock(pos.top, pos.bottom, foldHeight)].push(pos.kind);
  }
  report.missedIntent = intendedFirstFold.filter((kind) => !report.above.includes(kind));
  return report;
}
