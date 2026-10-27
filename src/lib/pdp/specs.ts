export interface SpecRow {
  name: string;
  value: string;
  /** True when the attribute is listed in the MCAT's ISQ list. */
  isIsq: boolean;
  /** True when the ISQ attribute has no value in this product's specs. */
  missing: boolean;
}

/** Parse "Name: Value" lines. Lines without a colon or with an empty side are skipped. */
export function parseSpecLines(specs: string): { name: string; value: string }[] {
  return specs
    .split("\n")
    .map((line) => {
      const idx = line.indexOf(":");
      if (idx === -1) return null;
      const name = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      return name && value ? { name, value } : null;
    })
    .filter((row): row is { name: string; value: string } => row !== null);
}

/**
 * Order spec rows by the MCAT's ISQ priority, then the product's remaining specs.
 * ISQ attributes the product lacks are returned as `missing` rows with an empty
 * value — they are flagged, never filled in.
 */
export function buildSpecRows(specs: string, isqAttributes: string[]): SpecRow[] {
  const lines = parseSpecLines(specs);
  const byName = new Map(lines.map((row) => [row.name.toLowerCase(), row]));
  const isqLower = isqAttributes.map((a) => a.toLowerCase());

  const isqRows: SpecRow[] = isqAttributes.map((attr) => {
    const match = byName.get(attr.toLowerCase());
    return match
      ? { name: match.name, value: match.value, isIsq: true, missing: false }
      : { name: attr, value: "", isIsq: true, missing: true };
  });
  const otherRows: SpecRow[] = lines
    .filter((row) => !isqLower.includes(row.name.toLowerCase()))
    .map((row) => ({ ...row, isIsq: false, missing: false }));

  return [...isqRows, ...otherRows];
}

export function splitHighlights(text: string): string[] {
  return text
    .split(/\n|,/)
    .map((h) => h.trim())
    .filter(Boolean);
}

/** "₹349", "₹349 – ₹420"; empty string when no price was given. */
export function formatPrice(price: string, priceMax: string): string {
  const min = price.trim();
  const max = priceMax.trim();
  if (!min && !max) return "";
  if (min && max && min !== max) return `₹${min} – ₹${max}`;
  return `₹${min || max}`;
}
