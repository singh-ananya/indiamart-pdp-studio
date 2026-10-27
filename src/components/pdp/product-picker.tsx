import type { Product } from "@/lib/pdp/types";

interface ProductPickerProps {
  products: Product[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

/** Chooses the one product that all five concepts preview, so layouts are compared fairly. */
export function ProductPicker({ products, selectedIndex, onSelect }: ProductPickerProps) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium">Product shown in every concept</legend>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {products.map((product, index) => {
          const selected = index === selectedIndex;
          return (
            <label
              key={product.id}
              className={
                selected
                  ? "flex min-w-36 max-w-52 shrink-0 cursor-pointer flex-col rounded-md border border-primary bg-accent px-3 py-2 text-left focus-within:ring-2 focus-within:ring-ring"
                  : "flex min-w-36 max-w-52 shrink-0 cursor-pointer flex-col rounded-md border px-3 py-2 text-left focus-within:ring-2 focus-within:ring-ring"
              }
            >
              <input
                type="radio"
                name="preview-product"
                className="sr-only"
                checked={selected}
                onChange={() => onSelect(index)}
              />
              <span className="text-xs font-semibold">Product {index + 1}</span>
              <span className="truncate text-xs text-muted-foreground">
                {product.name.trim() || "Untitled product"}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
