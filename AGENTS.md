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

- The IndiaMART PDP UI Generator generates concepts locally from user inputs, with no external research or paid APIs. The only backend is Supabase, used solely for the shared MCAT configuration (email sign-in for @indiamart.com users, Storage, a small metadata table). Why: the user first asked for a simple client-side version, then chose Supabase so the team shares one MCAT configuration. Do not add other backend features without asking.
- Never fabricate benchmark sources or research findings; Benchmark/Sources tabs show only user-pasted notes or actual in-app inputs. Why: the user requires honest, non-invented data.

## PDP Studio conventions (added on feature/pdp-studio-phase-0-2)

- All five concepts preview the same selected product (`previewProductIndex`). Why: layouts must be compared on identical content.
- Previews render only user-supplied data. Missing seller rating, tenure, trust signals, price, images or ISQ values show a "not provided" slot — never a placeholder value. Why: no fabricated data.
- The PDP context JSON is validated by the Zod schema in `src/lib/pdp/schema.ts`; new context fields go there, stay optional, and must not get default values.
- Studio state lives in `usePdpStudio` (`src/hooks/use-pdp-studio.ts`) and persists to `localStorage` key `indiamart-pdp-studio:v1`. Bump the version and keep old saves loadable when the shape changes. Imports must be fully validated before applying; an invalid import must not change state.
- Device previews render at real CSS-pixel size inside `DeviceFrame` and are scaled visually; the frame's height is the fold. Keep block sizes at real scale (no tiny text) or the fold report becomes meaningless.
- Panel state that must survive tab switches lives in the page, not inside `TabsContent` (Radix unmounts inactive tabs).

## MCAT configuration

- The MCAT configuration is the im-lite master file `mcatcontext.json` (`{ version, mcats: { [id]: { importance_ranking: [{ Dimension, Level, Rank, Show }] } } }`). It has no MCAT names, product attributes or image URLs — never derive or invent them from it. Images come only from product `imageUrls`.
- Parsing and lookup live in `src/lib/pdp/mcat-config.ts`. Values are matched trimmed and lower-cased, exactly like im-lite; misspelt values are kept as written and reported, never corrected. `getMcatImageContext` must stay identical to im-lite's `buildLowImageIndex()` (a test checks it against the real file when present).
- Canonical storage is the private Supabase Storage bucket `mcat-config` (`versions/<sha256>.json`, insert-only) with metadata and an active pointer in the database; the last valid copy is cached in IndexedDB and refreshed only when the active SHA-256 changes (`src/lib/pdp/mcat-config-store.ts`, `src/hooks/use-mcat-config.ts`). Validate fully before activating; any failure (validation, upload, download, hash, cache write) keeps the previous valid configuration.
- Security lives in `supabase/migrations/*_mcat_config.sql` (RLS: signed-in @indiamart.com only; the active pointer moves only through security-definer functions). The app uses only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Never use, reference or commit `SUPABASE_SECRET_KEY`/service-role keys in this repo, and never prefix a secret with `VITE_`.
- Never commit the master file (`mcatcontext*.json` is git-ignored).
- The MCAT config is reported per concept (fold placement); it does not reorder concept blocks, so the five stay comparable.
