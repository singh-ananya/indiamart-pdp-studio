-- Benchmark research files (see src/lib/pdp/benchmark.ts), shared by everyone using
-- the studio. Each import adds a row; the newest row per MCAT is the one in use, and
-- older rows stay as history. Rows are never updated or deleted by users.
--
-- Access mirrors the MCAT configuration: signed-in @indiamart.com users only.
-- Depends on public.is_indiamart_user() from 20261027120000_mcat_config.sql.
-- Additive only: creates one new table and its policies.

create table public.pdp_benchmarks (
  id bigint generated always as identity primary key,
  mcat_name text not null check (mcat_name <> ''),
  mcat_id text not null default '',
  entry_count integer not null check (entry_count between 1 and 50),
  data jsonb not null check (jsonb_typeof(data) = 'object' and octet_length(data::text) < 1000000),
  uploaded_by text not null default (auth.jwt() ->> 'email'),
  uploaded_at timestamptz not null default now()
);

create index pdp_benchmarks_mcat_idx on public.pdp_benchmarks (mcat_id, lower(mcat_name), uploaded_at desc);

alter table public.pdp_benchmarks enable row level security;

create policy "indiamart users read benchmarks" on public.pdp_benchmarks
  for select to authenticated using (public.is_indiamart_user());

create policy "indiamart users add benchmarks" on public.pdp_benchmarks
  for insert to authenticated
  with check (
    public.is_indiamart_user()
    and uploaded_by = (auth.jwt() ->> 'email')
  );

-- No update or delete policies: history cannot be changed from the app.
