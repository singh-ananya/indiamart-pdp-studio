<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- PDP Genie (formerly "IndiaMART PDP UI Generator") generates concepts from user inputs. Backends: Supabase (shared MCAT configuration and saved benchmark research; email sign-in for @indiamart.com users) and two TanStack server functions in `src/lib/indiamart/product-server.ts`: one searches IndiaMART's public product search by name (`m.indiamart.com/ajaxrequest/search/search`) and one reads a single listing from the public PDP data endpoint (`m.indiamart.com/ajaxrequest/proddetail.php`). Both are CORS-restricted to IndiaMART, hence server-side. Keep them narrow: fixed URLs, short text query or numeric display ID only, no keys, mapped fields only (`src/lib/indiamart/product.ts`). Products are matched by name (`useProductSources`), the chosen listing is always shown, and the user can switch it. Do not add other backend features without asking.
- There is no demo data: briefs start empty, and `stripDemoData` removes untouched demo values from older saves. `demo-data.ts` remains only as test fixtures and for that clean-up. Product data is typed by the user or fetched from IndiaMART; never invented.
- In-app research (`src/lib/ai/research.ts`, "Run benchmark research") uses the user's OpenRouter key with the web plugin (Exa). Candidate URLs come only from the search engine's `url_citation` annotations, never from model text; IndiaMART domains are excluded; an observation is kept only if its evidence appears word-for-word in that page's search excerpt; only layout-free ("anywhere") patterns are recorded; pages with nothing verifiable are `not-inspected` with `type: "unknown"` when unread. Its output goes through the same validation and storage as an import.
- Never fabricate benchmark sources or research findings. Benchmark data comes only from research files (imported, or produced by the in-app research above) (`src/lib/pdp/benchmark.ts`, stored in Supabase table `pdp_benchmarks`) in which every inspected page carries observed patterns with quoted evidence and its URL, and pages that could not be opened are listed as `not-inspected` with the reason. IndiaMART's own pages (`*.indiamart.com`) are never benchmarks; validation rejects them. Benchmark/Sources tabs show that file, user-pasted notes and actual in-app inputs only. Why: the user requires honest, non-invented data, and chose "Claude researches, app imports" over live in-app research.

## AI key ("Your AI key" section)

- Each user enters their own OpenRouter / Groq / LiteLLM key in the browser (`src/lib/ai/providers.ts`, `src/hooks/use-ai-settings.ts`). The key is sent only to the chosen provider's server address. Never send it to Supabase, never put it in studio state or exports, never read it from a `VITE_` variable. It is written to localStorage (`pdp-genie:ai-settings:v1`) only when "Remember on this device" is ticked.
- Model names and prices are read live from the provider; never hard-code prices. Only the OpenRouter quick-pick model ids are fixed.
- Tests must not hit the network: `src/test/setup.ts` blocks `fetch`; inject a fake via `PdpStudio`'s `aiFetch` prop.

## Concepts and scoring

- With an AI key, "Generate 5 Concepts" asks the AI for five designs (`src/lib/ai/design.ts`) and they replace the fixed ones (saved as `aiDesign` in studio state, ids `ai-1`…`ai-5`). The AI decides only layout and emphasis: block order, first fold, which existing ISQ names to feature (`keyIsq`), CTA labels from `CTA_LABELS`, reasoning and benchmark page numbers. `validateDesign` drops anything else and records each correction; benchmark links are resolved from saved research, never taken from AI text; product values always come from the products. Without a key, or if the call fails, the fixed strategies below are used and the UI says so.
- The fixed concepts come from `generateConcepts` (`src/lib/pdp/concepts.ts`): MCAT Priority, Benchmark Consensus, Spec & Price First, Trust Forward, Visual Showcase. Ids and names are stable; block order and `rationale` depend on the MCAT ranking, the benchmark file and product data. Every concept renders every block once; without input a concept uses a stated default order and says so.
- The recommendation ranks concepts with `src/lib/pdp/scoring.ts`: fixed weights (MCAT 35, benchmark 25, fold fit 20, data shown 20) over measured fold reports; a criterion without input is left out and the rest rescaled, and the breakdown says so. Scores use only measurements taken for the current product, device and viewport.

## PDP Studio conventions (added on feature/pdp-studio-phase-0-2)

- All five concepts preview the same selected product (`previewProductIndex`). Why: layouts must be compared on identical content.
- Previews render only user-supplied data. Missing seller rating, tenure, trust signals, price, images or ISQ values show a "not provided" slot — never a placeholder value. Why: no fabricated data.
- The PDP context JSON is validated by the Zod schema in `src/lib/pdp/schema.ts`; new context fields go there, stay optional, and must not get default values.
- Studio state lives in `usePdpStudio` (`src/hooks/use-pdp-studio.ts`) and persists to `localStorage` key `indiamart-pdp-studio:v1`. Bump the version and keep old saves loadable when the shape changes. Imports must be fully validated before applying; an invalid import must not change state.
- PDP previews follow IndiaMART's Msite design guide (im-lite `design_guides.md`): tokens and rules in `src/lib/pdp/indiamart-design.ts`, styles in the `.im-pdp` block of `src/styles.css` (teal #1d8480 primary CTAs, Inter, 12px cards, 8px buttons, ≤2 CTAs and ≤2 badges per card, nothing under 11px). On mobile a 56px teal sticky action bar is always shown, so the fold is the viewport height minus 56px. The same rules go into the AI design brief. The PDP Genie tool UI itself keeps its own styling.
- Device previews render at real CSS-pixel size inside `DeviceFrame` and are scaled visually; the frame's height is the fold. Keep block sizes at real scale (no tiny text) or the fold report becomes meaningless.
- Panel state that must survive tab switches lives in the page, not inside `TabsContent` (Radix unmounts inactive tabs).

## MCAT configuration

- The MCAT configuration is the im-lite master file `mcatcontext.json` (`{ version, mcats: { [id]: { importance_ranking: [{ Dimension, Level, Rank, Show }] } } }`). It has no MCAT names, product attributes or image URLs — never derive or invent them from it. Images come only from product `imageUrls`.
- Parsing and lookup live in `src/lib/pdp/mcat-config.ts`. Values are matched trimmed and lower-cased, exactly like im-lite; misspelt values are kept as written and reported, never corrected. `getMcatImageContext` must stay identical to im-lite's `buildLowImageIndex()` (a test checks it against the real file when present).
- Canonical storage is the private Supabase Storage bucket `mcat-config` (`versions/<sha256>.json`, insert-only) with metadata and an active pointer in the database; the last valid copy is cached in IndexedDB and refreshed only when the active SHA-256 changes (`src/lib/pdp/mcat-config-store.ts`, `src/hooks/use-mcat-config.ts`). Validate fully before activating; any failure (validation, upload, download, hash, cache write) keeps the previous valid configuration.
- Security lives in `supabase/migrations/*_mcat_config.sql` (RLS: signed-in @indiamart.com only; the active pointer moves only through security-definer functions). The app uses only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, committed in `.env` (public values only, so Lovable builds get them; `src/test/env-files.test.ts` guards it). Other `.env.*` files stay git-ignored. Never use, reference or commit `SUPABASE_SECRET_KEY`/service-role keys in this repo, and never prefix a secret with `VITE_`.
- Never commit the master file (`mcatcontext*.json` is git-ignored).
- The MCAT config is reported per concept (fold placement); it does not reorder concept blocks, so the five stay comparable.
