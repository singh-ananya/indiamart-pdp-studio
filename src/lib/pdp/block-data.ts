import { buildSpecRows, formatPrice, keyIsqValues, splitHighlights } from "./specs";
import type { BlockKind, PdpContext, Product } from "./types";

/**
 * Whether a preview block shows real, user-supplied data for this product, or only
 * its "not provided" slot. Mirrors what each block in concept-preview.tsx renders.
 */
export function blockHasData(
  kind: BlockKind,
  product: Product,
  ctx: PdpContext | null,
  keyIsq?: string[],
): boolean {
  if (kind === "highlights" && keyIsqValues(product.specs, keyIsq).length > 0) return true;
  switch (kind) {
    case "gallery":
      return product.imageUrls.length > 0;
    case "title":
      return product.name.trim() !== "";
    case "price":
      return formatPrice(product.price, product.priceMax) !== "";
    case "cta":
      return true; // fixed enquiry buttons, not data
    case "ratings":
      return ctx?.sellerRating !== undefined;
    case "offer":
      return Boolean(ctx?.offer);
    case "highlights":
      return splitHighlights(product.highlights).length + (ctx?.usps.length ?? 0) > 0;
    case "specs":
      return buildSpecRows(product.specs, ctx?.isqAttributes ?? []).some((row) => !row.missing);
    case "description":
      return product.description.trim() !== "";
    case "trust":
      return Boolean(ctx?.verifiedSupplier || ctx?.gstVerified || ctx?.responseRate !== undefined);
    case "seller":
      return Boolean(ctx?.brand || ctx?.city || ctx?.memberSince);
  }
}

/** Products the user has actually started filling in (a name or a price). */
export function filledProducts(products: Product[]): Product[] {
  return products.filter((p) => p.name.trim() !== "" || p.price.trim() !== "");
}

/** "3 of 5 products have images" style counts across the filled products. */
export function countWithData(kind: BlockKind, products: Product[], ctx: PdpContext | null) {
  const filled = filledProducts(products);
  return { have: filled.filter((p) => blockHasData(kind, p, ctx)).length, of: filled.length };
}
