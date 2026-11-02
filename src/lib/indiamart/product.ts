import type { Product } from "@/lib/pdp/types";

/**
 * Real product data from IndiaMART's own PDP data endpoint (the one im-lite uses:
 * m.indiamart.com/ajaxrequest/proddetail.php?displayId=…). Only fields the response
 * actually contains are filled; anything missing stays empty and the previews show
 * "not provided".
 */

export const PDP_DATA_URL = "https://m.indiamart.com/ajaxrequest/proddetail.php";
/** IndiaMART's public product search (the one im-lite's search page uses). */
export const SEARCH_URL = "https://m.indiamart.com/ajaxrequest/search/search";
export const MAX_QUERY_LENGTH = 120;

/** One listing from IndiaMART search, enough to choose a match. */
export interface SearchMatch {
  displayId: string;
  title: string;
  price: string;
  company: string;
  city: string;
  mcatIds: string[];
  /** Small https thumbnail, when the result has one. */
  thumbnail: string;
}

export type SearchResult = { ok: true; matches: SearchMatch[] } | { ok: false; error: string };

/** Map the search endpoint's JSON to listings. Unknown shapes give no matches. */
export function mapSearchResults(body: unknown): SearchMatch[] {
  const results = (body as { results?: unknown } | null)?.results;
  if (!Array.isArray(results)) return [];
  const matches: SearchMatch[] = [];
  for (const item of results) {
    if (typeof item !== "object" || item === null) continue;
    const r = ((item as { fields?: unknown }).fields ?? item) as Record<string, unknown>;
    const displayId = str(r["displayid"]);
    const title = str(r["title"]) || str(r["original_title"]);
    if (!/^\d{6,20}$/.test(displayId) || !title) continue;
    const mcat = r["mcatid"];
    matches.push({
      displayId,
      title: toPlainText(title),
      price: str(r["price_f"]) || str(r["itemprice"]),
      company: str(r["companyname"]),
      city: str(r["city"]),
      mcatIds: (Array.isArray(mcat) ? mcat : [mcat]).map(str).filter(Boolean),
      thumbnail: httpsUrl(r["image"]) || httpsUrl(r["large_image"]),
    });
  }
  return matches;
}

const tokens = (text: string) =>
  new Set(
    text
      .toLowerCase()
      .replace(/(\d+)\s*(inches|inch|in\b|")/g, "$1inch")
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 1 || /\d/.test(t)),
  );

/**
 * How well a listing title matches the product name: the share of the name's words
 * found in the title (0–1), plus a small bonus when the listing is in the brief's MCAT.
 */
export function matchScore(name: string, match: SearchMatch, mcatId: string): number {
  const want = tokens(name);
  if (want.size === 0) return 0;
  const have = tokens(match.title);
  let hits = 0;
  for (const t of want) if (have.has(t)) hits++;
  const bonus = mcatId.trim() && match.mcatIds.includes(mcatId.trim()) ? 0.1 : 0;
  return hits / want.size + bonus;
}

/** Listings ordered best match first (ties keep IndiaMART's own order). */
export function rankMatches(name: string, matches: SearchMatch[], mcatId: string): SearchMatch[] {
  return matches
    .map((m, i) => ({ m, i, s: matchScore(name, m, mcatId) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map(({ m }) => m);
}

/** A match is "close" when most of the name's words are in the listing title. */
export const CLOSE_MATCH = 0.6;
const MAX_IMAGES = 10;

/**
 * Accepts a display ID ("2851707213873") or an IndiaMART product URL
 * (".../proddetail/32-inch-led-tv-2851707213873.html", "...?displayId=…").
 */
export function parseIndiaMartId(input: string): string | null {
  const value = input.trim();
  if (/^\d{6,20}$/.test(value)) return value;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (host !== "indiamart.com" && !host.endsWith(".indiamart.com")) return null;
  const param = url.searchParams.get("displayId");
  if (param && /^\d{6,20}$/.test(param)) return param;
  const match = /-(\d{6,20})\.html?$/i.exec(url.pathname);
  return match ? match[1]! : null;
}

export interface IndiaMartSeller {
  name: string;
  city: string;
  rating?: number | undefined;
  ratingCount?: number | undefined;
  gstVerified?: boolean | undefined;
  /** Year the seller joined IndiaMART, e.g. "2020". */
  memberSince?: string | undefined;
}

export interface IndiaMartProduct {
  displayId: string;
  /** Fields ready to merge into a product card. */
  product: Omit<Product, "id">;
  mcatId: string;
  mcatName: string;
  seller: IndiaMartSeller;
}

export type IndiaMartResult = { ok: true; data: IndiaMartProduct } | { ok: false; error: string };

const str = (v: unknown) =>
  typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";

const httpsUrl = (v: unknown) => {
  const s = str(v);
  return /^https:\/\//i.test(s) ? s : "";
};

/** Plain text from IndiaMART's HTML-ish descriptions. */
export function toPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|div)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

function specsFrom(isq: unknown): string {
  if (!Array.isArray(isq)) return "";
  return isq
    .filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null)
    .map((row) => ({
      name: str(row["FK_IM_SPEC_MASTER_DESC"]),
      value: [str(row["SUPPLIER_RESPONSE_DETAIL"]), str(row["SUPPLIER_RESPONSE_DETAIL_UOM"])]
        .filter(Boolean)
        .join(" "),
      priority: Number(str(row["IM_CAT_SPEC_PRIORITY"])) || 99,
    }))
    .filter((row) => row.name && row.value)
    .sort((a, b) => a.priority - b.priority)
    .map((row) => `${row.name}: ${row.value}`)
    .join("\n");
}

function imagesFrom(raw: Record<string, unknown>): string[] {
  const list = Array.isArray(raw["ITEM_IMG"]) ? (raw["ITEM_IMG"] as unknown[]) : [];
  const urls = list
    .filter((img): img is Record<string, unknown> => typeof img === "object" && img !== null)
    .map((img) => httpsUrl(img["IMAGE_500X500"]) || httpsUrl(img["IMAGE_ORIGINAL"]))
    .filter(Boolean);
  const main = httpsUrl(raw["PC_IMG_SMALL_600X600"]);
  if (urls.length === 0 && main) urls.push(main);
  return [...new Set(urls)].slice(0, MAX_IMAGES);
}

/** "₹ 7,800 / Piece" → "Piece"; falls back to the MOQ unit type. */
function unitFrom(raw: Record<string, unknown>): string {
  const match = /\/\s*([^/]+?)\s*$/.exec(str(raw["PRODUCT_PRICE"]));
  return match ? match[1]! : str(raw["PC_ITEM_MOQ_UNIT_TYPE"]);
}

function priceFrom(raw: Record<string, unknown>): string {
  const value = Number(str(raw["FOB_PRICE"]));
  // IndiaMART flags implausible prices; never show those as the product's price.
  if (!Number.isFinite(value) || value <= 0 || str(raw["PC_ITEM_FOB_PRICE_ABSURD_FLAG"]) === "1") {
    return "";
  }
  return String(value);
}

function sellerFrom(raw: Record<string, unknown>): IndiaMartSeller {
  const rating = Number(str(raw["SELLER_RATING"]));
  const counts = raw["SELLER_RATING_COUNTS"] as { total_count?: unknown } | null | undefined;
  const total = Number(counts?.total_count);
  const since = /^(\d{4})-/.exec(str(raw["GLUSR_USR_MEMBERSINCE"]));
  return {
    name: str(raw["COMPANYNAME"]),
    city: str(raw["CITY"]),
    rating: Number.isFinite(rating) && rating > 0 && rating <= 5 ? rating : undefined,
    ratingCount: Number.isInteger(total) && total > 0 ? total : undefined,
    gstVerified: str(raw["GST_VERIFIED"]) === "1" ? true : undefined,
    memberSince: since ? since[1] : undefined,
  };
}

/** Map the endpoint's JSON (an array with one product) to app fields. Never throws. */
export function mapIndiaMartProduct(body: unknown, displayId: string): IndiaMartResult {
  const raw = Array.isArray(body) ? body[0] : body;
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, error: "IndiaMART returned no product data for this ID." };
  }
  const r = raw as Record<string, unknown>;
  const name = str(r["PC_ITEM_DISPLAY_NAME"]) || str(r["PC_ITEM_NAME"]);
  if (!name) return { ok: false, error: "IndiaMART returned no product data for this ID." };
  return {
    ok: true,
    data: {
      displayId,
      mcatId: str(r["BRD_MCAT_ID"]),
      mcatName: str(r["BRD_MCAT_NAME"]),
      seller: sellerFrom(r),
      product: {
        name,
        price: priceFrom(r),
        priceMax: "",
        unit: unitFrom(r),
        moq: str(r["ETO_OFR_QTY"]) || str(r["PC_ITEM_MIN_ORDER_QUANTITY"]),
        highlights: "",
        specs: specsFrom(r["ISQ"]),
        description: toPlainText(str(r["PC_ITEM_DESC_SMALL"])),
        imageUrls: imagesFrom(r),
      },
    },
  };
}
