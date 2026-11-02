import { createServerFn } from "@tanstack/react-start";
import {
  MAX_QUERY_LENGTH,
  mapIndiaMartProduct,
  mapSearchResults,
  PDP_DATA_URL,
  SEARCH_URL,
  type IndiaMartResult,
  type SearchResult,
} from "./product";

/**
 * Server function: searches IndiaMART's public product search by name. Same limits
 * as below: one fixed URL, a short text query, no keys, mapped fields only.
 */
export const searchIndiaMartProducts = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => {
    const query = String((input as { query?: unknown } | null)?.query ?? "")
      .replace(/\s+/g, " ")
      .trim();
    if (query.length < 2 || query.length > MAX_QUERY_LENGTH) {
      throw new Error("Product name must be 2–120 characters");
    }
    return { query };
  })
  .handler(async ({ data }): Promise<SearchResult> => {
    let response: Response;
    try {
      response = await fetch(`${SEARCH_URL}?s=${encodeURIComponent(data.query)}`, {
        headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (PDP Genie)" },
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      return { ok: false, error: "Could not reach IndiaMART search. Try again." };
    }
    if (!response.ok)
      return { ok: false, error: `IndiaMART search answered HTTP ${response.status}.` };
    try {
      return { ok: true, matches: mapSearchResults(await response.json()) };
    } catch {
      return { ok: false, error: "IndiaMART search did not return results." };
    }
  });

/**
 * Server function: reads one product from IndiaMART's PDP data endpoint.
 *
 * It runs on the server because IndiaMART only allows browsers on m.indiamart.com to
 * read that endpoint (CORS). It is deliberately narrow: numeric display IDs only, this
 * one fixed URL, no keys or secrets, and only mapped fields are returned.
 */
export const fetchIndiaMartProduct = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => {
    const displayId = String((input as { displayId?: unknown } | null)?.displayId ?? "");
    if (!/^\d{6,20}$/.test(displayId)) throw new Error("Invalid IndiaMART product ID");
    return { displayId };
  })
  .handler(async ({ data }): Promise<IndiaMartResult> => {
    let response: Response;
    try {
      response = await fetch(`${PDP_DATA_URL}?displayId=${data.displayId}`, {
        headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (PDP Genie)" },
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      return { ok: false, error: "Could not reach IndiaMART. Try again." };
    }
    if (response.status === 404) {
      return { ok: false, error: "IndiaMART has no product with this ID." };
    }
    if (!response.ok) {
      return { ok: false, error: `IndiaMART answered HTTP ${response.status}.` };
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return { ok: false, error: "IndiaMART did not return product data for this ID." };
    }
    if ((body as { status?: unknown } | null)?.status === "404") {
      return { ok: false, error: "IndiaMART has no product with this ID." };
    }
    return mapIndiaMartProduct(body, data.displayId);
  });
