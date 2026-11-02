# PDP Genie

UI/UX benchmarking and layout concepts for IndiaMART product detail pages (formerly "IndiaMART PDP
UI Generator"; the repository keeps the name `indiamart-pdp-studio`).

Create a web app called IndiaMART PDP UI Generator. Build a clean, professional, mobile-first interface for designing IndiaMART Product Detail Pages. Include an MCAT name input, a JSON context editor, five editable product cards, Mobile/Desktop and First Fold/Full PDP selectors, and a Generate 5 Concepts button. Add tabs for Five Concepts, Benchmark Comparison, Sources, and Final Recommendation. Show five distinct PDP preview panels. Use realistic IndiaMART-inspired styling. Make the input fields and tabs functional. Clearly label sample data as demo data and never invent benchmark sources or research findings. Keep the initial version simple, responsive, and easy to maintain. Do not add authentication, a database, or paid API integrations yet.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/01dfde95-18f9-4232-990a-e6f864c55d72).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Benchmark research

**In the app:** enter the MCAT name (and ID) plus product names, add your OpenRouter key in
**Your AI key**, then Benchmark Comparison → **Run benchmark research**. It runs 3 web searches
(OpenRouter web plugin, Exa engine; IndiaMART excluded), reads each result from the search
engine's text excerpt, and keeps an observation only if its quoted evidence appears word-for-word
in that excerpt. Layout ("before scrolling") patterns are not recorded, because excerpts do not
show layout. The result is saved to Saved research for everyone. Cost is reported after each run.

**By hand:** research can also be done outside the app and imported as a JSON
file (Benchmark Comparison tab → **Import benchmark JSON**), then shared through Supabase
(table `pdp_benchmarks`; run `supabase/migrations/20261102120000_pdp_benchmarks.sql` once). The
newest file per MCAT is used for that MCAT.

Workflow for each MCAT:

1. Search for product detail pages of that product on B2B and e-commerce sites (aim for 20).
   Never use IndiaMART's own pages: IndiaMART is what is being improved, and the import rejects
   any `indiamart.com` URL.
2. Open each page. Record only what is actually visible, as observations using the pattern ids
   in `src/lib/pdp/benchmark.ts` (or `other`), each with quoted text or a precise location as
   evidence, plus strengths and applicability to IndiaMART.
3. A page that cannot be opened (blocked, login wall, timeout) stays in the file as
   `"status": "not-inspected"` with the reason. Never fill it in from memory.

File format (validated on import; an invalid file changes nothing):

```json
{
  "app": "indiamart-pdp-studio-benchmark",
  "version": 1,
  "mcat": { "name": "Steel Pipes", "id": "12345" },
  "researchedAt": "2026-11-02",
  "method": "How the pages were found and inspected",
  "entries": [
    {
      "site": "Example", "type": "b2b", "url": "https://…", "status": "inspected",
      "inspectedAt": "2026-11-02",
      "observations": [{ "pattern": "specs-above-fold", "note": "…", "evidence": "…" }],
      "strengths": ["…"], "applicability": "…"
    },
    { "site": "Other", "type": "ecommerce", "url": "https://…", "status": "not-inspected",
      "reason": "HTTP 403 (bot protection)" }
  ]
}
```

## Concepts and ranking

The five concepts (MCAT Priority, Benchmark Consensus, Spec & Price First, Trust Forward, Visual
Showcase) are generated from the MCAT ranking, the benchmark file and the five products; each card
says which data shaped it. The Final Recommendation tab ranks them from the measured previews:
MCAT priorities above the fold (35), benchmark patterns matched (25), planned first fold fits (20)
and real product data above the fold (20). A criterion without input is left out and the others are
rescaled; every score shows its reasoning.

## MCAT configuration

The studio reads the im-lite MCAT master file (`mcatcontext.json`): per MCAT, how much buyers
care about image, specification, price, company and unit. Enter an MCAT ID in the brief and
every concept reports where those dimensions land against its measured fold.

### How it is stored

- **Canonical copy:** Supabase Storage, private bucket `mcat-config`, one object per version at
  `versions/<sha256>.json`. A database table records each version; a one-row pointer marks the
  active one. Earlier versions are kept for rollback.
- **Local cache:** the last valid copy in this browser's IndexedDB. On load the app compares its
  SHA-256 with the active version and downloads the ~32 MB file only when they differ.
- **Access:** only signed-in users with an `@indiamart.com` email (Supabase email link) can read or
  upload. This is enforced by the row-level security policies in `supabase/migrations/`.
- **Upload / replace:** the browser validates the whole file and computes its SHA-256, uploads it,
  then a database function checks the stored object and switches the active pointer in one step.
  On any failure (validation, upload, download, hash mismatch, cache write) the previous valid
  configuration stays in use.

### One-time Supabase setup

1. In the Supabase SQL editor, run `supabase/migrations/20261027120000_mcat_config.sql`. It keeps
   the `mcat-config` bucket private and creates the tables, policies and functions.
2. **Authentication → Providers → Email:** enabled (magic link).
3. **Authentication → URL Configuration:** add the app's URLs to the redirect allow list, e.g.
   `http://localhost:8080` (or whatever port `npm run dev` prints) and the deployed Lovable URL.
4. Sign in to the app and use **Upload MCAT JSON** with
   `C:\Users\Imart\mobile-im-pw\im-lite\server\McatContextJSON\mcatcontext.json`.

### Environment variables

| Variable | Local development | Production (Lovable build) | Secret? |
|---|---|---|---|
| `VITE_SUPABASE_URL` | Committed `.env` | Committed `.env` | No — shipped to the browser |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Committed `.env` | Committed `.env` | No — public by design |
| `SUPABASE_SECRET_KEY` | **Not used. Do not set it.** | **Not used. Do not set it.** | Yes |
| `SUPABASE_JWKS_URL` | Not used | Not used | No |

The two public values are committed in `.env`, so Lovable's preview and live builds get them from
the repo. `src/test/env-files.test.ts` fails if `.env` ever holds anything else. To point a local
copy at a different project, put overrides in `.env.local` (git-ignored, along with every other
`.env.*` file). The app has no server-side code that would need the secret key; never prefix a
secret with `VITE_`, because Vite ships every `VITE_` variable to browsers.
