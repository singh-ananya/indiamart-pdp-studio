import type { BlockKind, Concept } from "./types";

export const BLOCK_LABELS: Record<BlockKind, string> = {
  gallery: "Gallery",
  title: "Title",
  price: "Price",
  cta: "Enquiry buttons",
  ratings: "Ratings",
  offer: "Offer strip",
  highlights: "Highlights",
  specs: "ISQ / specs",
  description: "Description",
  trust: "Trust signals",
  seller: "Seller card",
};

/**
 * The five PDP layout directions are fixed, local design patterns.
 * They are derived only from the user's own inputs at render time —
 * no research, scraping, or invented benchmark claims are involved.
 */
export const CONCEPTS: Concept[] = [
  {
    id: "classic-catalogue",
    name: "Classic Catalogue",
    tagline: "IndiaMART-native ordering: gallery → title → price → CTA.",
    bestFor: "Familiar layout for habitual marketplace buyers.",
    firstFold: ["gallery", "title", "price", "cta"],
    below: ["ratings", "specs", "highlights", "description", "seller"],
  },
  {
    id: "visual-showcase",
    name: "Visual Showcase",
    tagline: "Image-led scroll with highlights before the price reveal.",
    bestFor: "Design-led products where photos sell the story.",
    firstFold: ["gallery", "title", "highlights", "cta"],
    below: ["price", "ratings", "specs", "description", "trust", "seller"],
  },
  {
    id: "spec-first",
    name: "Spec-First",
    tagline: "Technical table above the fold for specification buyers.",
    bestFor: "Industrial and B2B buyers who scan specs first.",
    firstFold: ["title", "specs", "price", "cta"],
    below: ["gallery", "highlights", "description", "trust", "seller"],
  },
  {
    id: "trust-forward",
    name: "Trust Forward",
    tagline: "Seller credentials and badges lead the page.",
    bestFor: "New sellers building credibility with first-time buyers.",
    firstFold: ["seller", "trust", "gallery", "title", "price", "cta"],
    below: ["ratings", "highlights", "description", "specs"],
  },
  {
    id: "offer-highlight",
    name: "Offer Highlight",
    tagline: "Promo strip on top, strike-through style offer framing.",
    bestFor: "Clearance pushes, festive offers and bulk deals.",
    firstFold: ["offer", "gallery", "title", "price", "cta"],
    below: ["ratings", "highlights", "specs", "description", "seller"],
  },
];
