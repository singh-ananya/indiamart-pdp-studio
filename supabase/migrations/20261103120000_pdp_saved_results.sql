-- Saved results: each successful AI design run (MCAT, the five products' IndiaMART data,
-- seller details and the AI's five designs), shared so anyone signed in can reopen it
-- later without an AI key. Rows are added by the app and never updated or deleted by users.
--
-- Access mirrors the other tables: signed-in @indiamart.com users only.
-- Depends on public.is_indiamart_user() from 20261027120000_mcat_config.sql.
-- Additive only: creates one new table and its policies.

create table public.pdp_saved_results (
  id bigint generated always as identity primary key,
  mcat_name text not null default '',
  mcat_id text not null default '',
  model text not null default '',
  data jsonb not null check (jsonb_typeof(data) = 'object' and octet_length(data::text) < 1000000),
  created_by text not null default (auth.jwt() ->> 'email'),
  created_at timestamptz not null default now()
);

create index pdp_saved_results_created_idx on public.pdp_saved_results (created_at desc);

alter table public.pdp_saved_results enable row level security;

create policy "indiamart users read saved results" on public.pdp_saved_results
  for select to authenticated using (public.is_indiamart_user());

create policy "indiamart users add saved results" on public.pdp_saved_results
  for insert to authenticated
  with check (
    public.is_indiamart_user()
    and created_by = (auth.jwt() ->> 'email')
  );

-- No update or delete policies: saved results cannot be changed from the app.
