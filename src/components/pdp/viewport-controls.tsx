import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { matchPreset, presetsFor, VIEWPORT_LIMITS } from "@/lib/pdp/devices";
import type { Viewport } from "@/lib/pdp/studio-state";
import type { DeviceMode } from "@/lib/pdp/types";

interface ViewportControlsProps {
  device: DeviceMode;
  viewport: Viewport;
  onChange: (viewport: Viewport) => void;
}

function DimensionInput({
  id,
  label,
  value,
  min,
  max,
  onCommit,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const parsed = Number(draft);
  const valid = Number.isInteger(parsed) && parsed >= min && parsed <= max;

  const commit = () => {
    if (valid) onCommit(parsed);
    else setDraft(String(value));
  };

  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        inputMode="numeric"
        value={draft}
        aria-invalid={!valid}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
        }}
        className="h-8 w-24"
      />
    </div>
  );
}

export function ViewportControls({ device, viewport, onChange }: ViewportControlsProps) {
  const presets = presetsFor(device);
  const current = matchPreset(device, viewport);

  return (
    <div className="space-y-1.5">
      <Label htmlFor="screen-size" className="text-xs font-medium text-muted-foreground">
        Screen size (CSS px)
      </Label>
      <select
        id="screen-size"
        className="h-9 w-full rounded-md border bg-background px-2 text-sm"
        value={current?.id ?? "custom"}
        onChange={(event) => {
          const preset = presets.find((p) => p.id === event.target.value);
          if (preset) onChange({ width: preset.width, height: preset.height });
        }}
      >
        {presets.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label} ({p.width} × {p.height})
          </option>
        ))}
        {!current && (
          <option value="custom">
            Custom ({viewport.width} × {viewport.height})
          </option>
        )}
      </select>
      <div className="flex gap-2" key={`${device}-${viewport.width}-${viewport.height}`}>
        <DimensionInput
          id="viewport-width"
          label="Width"
          value={viewport.width}
          {...VIEWPORT_LIMITS.width}
          onCommit={(width) => onChange({ ...viewport, width })}
        />
        <DimensionInput
          id="viewport-height"
          label="Visible height"
          value={viewport.height}
          {...VIEWPORT_LIMITS.height}
          onCommit={(height) => onChange({ ...viewport, height })}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Presets are full screen sizes. To match what a buyer sees, lower the height by the status
        bar and browser address bar you measured.
      </p>
    </div>
  );
}
