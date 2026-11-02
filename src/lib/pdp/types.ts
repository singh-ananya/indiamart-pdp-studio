export interface Product {
  id: string;
  name: string;
  /** Single price, or the lower end of a price range. */
  price: string;
  /** Upper end of a price range; empty for a single price. */
  priceMax: string;
  /** Selling unit, e.g. "piece", "kg". Empty when not provided. */
  unit: string;
  moq: string;
  highlights: string;
  /** ISQ / spec values, one "Name: Value" per line. */
  specs: string;
  description: string;
  /** http(s) image URLs. Empty when not provided — previews never invent images. */
  imageUrls: string[];
}

export interface PdpContext {
  ok: boolean;
  /** First problem found, for compact display. */
  error?: string | undefined;
  /** Every validation problem found. Empty when ok. */
  issues: string[];
  /** Keys present in the JSON that the generator does not use. */
  ignoredKeys: string[];
  brand: string;
  category: string;
  city: string;
  offer: string;
  usps: string[];
  /** MCAT-level ISQ attribute names in priority order. */
  isqAttributes: string[];
  // Optional seller signals. `undefined` means "not provided" and is never filled in.
  sellerRating?: number | undefined;
  ratingCount?: number | undefined;
  memberSince?: string | undefined;
  gstVerified?: boolean | undefined;
  verifiedSupplier?: boolean | undefined;
  responseRate?: number | undefined;
}

export type DeviceMode = "mobile" | "desktop";
export type FoldMode = "first" | "full";

export type BlockKind =
  | "gallery"
  | "title"
  | "price"
  | "cta"
  | "ratings"
  | "offer"
  | "highlights"
  | "specs"
  | "description"
  | "trust"
  | "seller";

export interface Concept {
  id: string;
  name: string;
  tagline: string;
  bestFor: string;
  firstFold: BlockKind[];
  below: BlockKind[];
  /** Which inputs shaped this layout, or why a default order was used. */
  rationale?: string[];
  /** "ai" when designed by the AI from the benchmark; otherwise a fixed strategy. */
  source?: "ai" | "fixed";
  /** ISQ names to feature in the highlights block (values always come from the product). */
  keyIsq?: string[];
  /** Enquiry button labels, from the IndiaMART-style list in `ai/design.ts`. */
  cta?: { primary: string; secondary: string };
  /** Benchmark pages the design draws on (resolved from saved research, never from AI text). */
  benchmarkRefs?: { site: string; url: string }[];
}
