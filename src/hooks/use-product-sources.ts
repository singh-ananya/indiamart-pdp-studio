import { useCallback, useRef, useState } from "react";
import {
  CLOSE_MATCH,
  matchScore,
  rankMatches,
  type IndiaMartResult,
  type IndiaMartSeller,
  type SearchMatch,
  type SearchResult,
} from "@/lib/indiamart/product";
import type { Product } from "@/lib/pdp/types";

export interface SourceState {
  busy: boolean;
  error: string | null;
  /** Listings found for the name, best match first. */
  matches: SearchMatch[];
  selectedId: string | null;
  /** Shown when the chosen listing only loosely matches the name. */
  looseMatch: boolean;
  summary: string | null;
  seller: IndiaMartSeller | null;
  mcatNote: string | null;
}

const EMPTY: SourceState = {
  busy: false,
  error: null,
  matches: [],
  selectedId: null,
  looseMatch: false,
  summary: null,
  seller: null,
  mcatNote: null,
};

interface Options {
  search: (query: string) => Promise<SearchResult>;
  fetchProduct: (displayId: string) => Promise<IndiaMartResult>;
  /** Brief MCAT ID, used to rank listings and flag other MCATs. */
  mcatId: string;
  onFetched: (productId: string, fields: Omit<Product, "id">) => void;
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

function summarize(fields: Omit<Product, "id">): string {
  const parts = [
    fields.price ? "price" : "",
    fields.imageUrls.length ? `${fields.imageUrls.length} image(s)` : "",
    fields.specs ? `${fields.specs.split("\n").length} ISQ value(s)` : "",
    fields.moq ? "MOQ" : "",
    fields.description ? "description" : "",
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "name only";
}

/**
 * Finds each product on IndiaMART by name and fills it with the chosen listing's real
 * data. Nothing is filled from a listing the user has not been shown; on any error the
 * product is left unchanged.
 */
export function useProductSources({ search, fetchProduct, mcatId, onFetched }: Options) {
  const [states, setStates] = useState<Record<string, SourceState>>({});
  // Latest values for async work started earlier.
  const latest = useRef({ search, fetchProduct, mcatId, onFetched });
  latest.current = { search, fetchProduct, mcatId, onFetched };

  const patch = useCallback((id: string, next: Partial<SourceState>) => {
    setStates((prev) => ({ ...prev, [id]: { ...(prev[id] ?? EMPTY), ...next } }));
  }, []);

  /** Fetch one listing's details into the product. */
  const choose = useCallback(
    async (productId: string, displayId: string, matches?: SearchMatch[], name?: string) => {
      const { fetchProduct: fetchOne, mcatId: briefMcat, onFetched: fill } = latest.current;
      patch(productId, { busy: true, error: null });
      let result: IndiaMartResult;
      try {
        result = await fetchOne(displayId);
      } catch (error) {
        result = { ok: false, error: message(error) };
      }
      if (!result.ok) {
        patch(productId, { busy: false, error: `${result.error} The product was not changed.` });
        return;
      }
      const { product: fields, seller, mcatId: fetchedMcat, mcatName } = result.data;
      fill(productId, fields);
      setStates((prev) => {
        const current = prev[productId] ?? EMPTY;
        const list = matches ?? current.matches;
        const chosen = list.find((m) => m.displayId === displayId);
        return {
          ...prev,
          [productId]: {
            ...current,
            busy: false,
            error: null,
            matches: list,
            selectedId: displayId,
            looseMatch:
              name !== undefined && chosen !== undefined
                ? matchScore(name, chosen, briefMcat) < CLOSE_MATCH
                : false,
            summary: `Filled from IndiaMART: ${summarize(fields)}.`,
            seller,
            mcatNote:
              briefMcat.trim() && fetchedMcat && fetchedMcat !== briefMcat.trim()
                ? `This listing is in MCAT ${fetchedMcat}${mcatName ? ` (${mcatName})` : ""}, not ${briefMcat.trim()}.`
                : null,
          },
        };
      });
    },
    [patch],
  );

  /** Search IndiaMART for the name and use the best-matching listing. */
  const find = useCallback(
    async (productId: string, name: string) => {
      const query = name.trim();
      if (query.length < 2) {
        patch(productId, { error: "Type the product name first." });
        return;
      }
      const { search: searchFn, mcatId: briefMcat } = latest.current;
      patch(productId, { ...EMPTY, busy: true });
      const run = async (q: string): Promise<SearchResult> => {
        try {
          return await searchFn(q.slice(0, 120));
        } catch (error) {
          return { ok: false, error: message(error) };
        }
      };
      let result = await run(query);
      // A generic category name ("32 inch LED TV") makes IndiaMART answer with a category
      // page instead of listings; asking for suppliers returns listings for it.
      if (result.ok && result.matches.length === 0) result = await run(`${query} supplier`);
      if (!result.ok) {
        patch(productId, { busy: false, error: `${result.error} The product was not changed.` });
        return;
      }
      const ranked = rankMatches(query, result.matches, briefMcat);
      if (ranked.length === 0) {
        patch(productId, {
          busy: false,
          error: `No IndiaMART listings found for "${query}". Try a shorter or more common name.`,
        });
        return;
      }
      patch(productId, { matches: ranked });
      await choose(productId, ranked[0]!.displayId, ranked, query);
    },
    [choose, patch],
  );

  /** Run `find` for every named product, one after another. */
  const findAll = useCallback(
    async (products: { id: string; name: string }[]) => {
      for (const p of products) {
        if (p.name.trim().length >= 2) await find(p.id, p.name);
      }
    },
    [find],
  );

  return { states, find, findAll, choose, empty: EMPTY };
}
