/**
 * IndiaMART Msite design system, from im-lite's design_guides.md ("Style Guide Msite").
 * The PDP previews are styled with these values (see `.im-pdp` in styles.css) and the
 * AI design brief includes `IM_DESIGN_RULES`. Keep both in step with the guide.
 */

/** Height of the sticky teal bottom action bar on mobile (guide: 56px + safe area). */
export const IM_STICKY_BAR_HEIGHT = 56;
/** Height of the white top navigation bar on mobile. */
export const IM_TOP_NAV_HEIGHT = 56;

/** Layout rules from the guide that matter when arranging a mobile PDP. */
export const IM_DESIGN_RULES = [
  "Single column, scroll-native, full-width white cards (12px radius) on a #f5f6f8 canvas; 16px page padding, 12px between elements.",
  "A white 56px top bar and a full teal (#1d8480) 56px sticky bottom action bar are always visible; the sticky bar carries the primary enquiry CTA, so 56px at the bottom of the screen is covered.",
  "Product name is the hero heading (18px bold, near-black #161921, never blue); price is 16px bold.",
  "Primary actions such as 'Call Supplier' / 'Send Inquiry' are teal; indigo (#2e3192) is only for 'Post Your Requirement'. Teal and indigo CTAs are never equal weight.",
  "Never stack more than 2 CTAs in a card; CTAs are 48px high with 8px radius.",
  "Trust signals (Verified badge in green #1a9e56, ratings, response rate) are compact but prominent; at most 2 badges on any card; trust text is 11px.",
  "Specs, captions and listing text use 13px; nothing smaller than 11px.",
];
