export interface Product {
  id: string;
  name: string;
  price: string;
  moq: string;
  highlights: string;
  specs: string;
  description: string;
}

export interface PdpContext {
  ok: boolean;
  error?: string;
  brand: string;
  category: string;
  city: string;
  offer: string;
  usps: string[];
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
}
