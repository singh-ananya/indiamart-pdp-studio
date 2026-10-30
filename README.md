# IndiaMART PDP Studio

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
| `VITE_SUPABASE_URL` | `.env.local` | Build environment | No — shipped to the browser |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `.env.local` | Build environment | No — public by design |
| `SUPABASE_SECRET_KEY` | **Not used. Do not set it.** | **Not used. Do not set it.** | Yes |
| `SUPABASE_JWKS_URL` | Not used | Not used | No |

Copy `.env.example` to `.env.local` and fill in the publishable key. `.env` and `.env.*` files are
git-ignored (except `.env.example`). The app has no server-side code that would need the secret
key; never prefix a secret with `VITE_`, because Vite ships every `VITE_` variable to browsers.
