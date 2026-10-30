-- MCAT configuration (im-lite mcatcontext.json), shared by everyone using the studio.
--
-- The file itself lives in the private Storage bucket "mcat-config" as
-- versions/<sha256>.json. Objects can be added but never updated or deleted by
-- users, so a stored version cannot be overwritten. The table below records each
-- version and a single-row pointer marks the active one. The pointer only moves
-- through the functions at the end, so a failed upload never replaces the active
-- configuration, and earlier versions stay available for rollback.
--
-- Access: only signed-in users whose email ends in @indiamart.com can read or upload.
-- The app uses only the publishable key; no secret key is needed anywhere.
--
-- The JSON is validated in the browser before upload and again by every reader
-- before use; the database checks that the object exists with the declared size.

-- Keep the bucket private even if it was created as public.
insert into storage.buckets (id, name, public)
values ('mcat-config', 'mcat-config', false)
on conflict (id) do update set public = false;

create or replace function public.is_indiamart_user()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(lower(auth.jwt() ->> 'email') like '%@indiamart.com', false)
$$;

create table public.mcat_config_versions (
  id bigint generated always as identity primary key,
  sha256 text not null unique check (sha256 ~ '^[0-9a-f]{64}$'),
  object_path text not null unique,
  size_bytes bigint not null check (size_bytes > 0),
  version text not null default '',
  file_name text not null,
  mcat_count integer not null check (mcat_count > 0),
  warnings jsonb not null default '[]'::jsonb,
  uploaded_by text not null,
  uploaded_at timestamptz not null default now()
);

-- Single row pointing at the active version.
create table public.mcat_config_active (
  id boolean primary key default true check (id),
  version_id bigint not null references public.mcat_config_versions (id),
  activated_by text not null,
  activated_at timestamptz not null default now()
);

alter table public.mcat_config_versions enable row level security;
alter table public.mcat_config_active enable row level security;

-- Read-only for users; all writes go through the functions below.
create policy "indiamart users read versions" on public.mcat_config_versions
  for select to authenticated using (public.is_indiamart_user());
create policy "indiamart users read active" on public.mcat_config_active
  for select to authenticated using (public.is_indiamart_user());

-- Storage: read any object in the bucket; add new objects under versions/ only.
-- There are no update or delete policies, so uploads with upsert are refused.
create policy "indiamart users read mcat config" on storage.objects
  for select to authenticated
  using (bucket_id = 'mcat-config' and public.is_indiamart_user());
create policy "indiamart users add mcat config versions" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'mcat-config'
    and public.is_indiamart_user()
    and name ~ '^versions/[0-9a-f]{64}\.json$'
  );

-- Record an uploaded object as a version and make it active, in one transaction.
create or replace function public.activate_uploaded_mcat_config(
  p_sha256 text,
  p_size_bytes bigint,
  p_version text,
  p_file_name text,
  p_mcat_count integer,
  p_warnings jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_path text := 'versions/' || p_sha256 || '.json';
  v_stored_size bigint;
  v_id bigint;
  v_email text := auth.jwt() ->> 'email';
begin
  if not public.is_indiamart_user() then
    raise exception 'Only signed-in @indiamart.com users can change the MCAT configuration';
  end if;
  if p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid SHA-256';
  end if;

  select (o.metadata ->> 'size')::bigint into v_stored_size
  from storage.objects o
  where o.bucket_id = 'mcat-config' and o.name = v_path;
  if not found then
    raise exception 'Uploaded file % was not found in storage', v_path;
  end if;
  if v_stored_size is distinct from p_size_bytes then
    raise exception 'Stored file is % bytes, expected %', v_stored_size, p_size_bytes;
  end if;

  -- Same content uploaded again: reuse the existing version.
  select id into v_id from public.mcat_config_versions where sha256 = p_sha256;
  if v_id is null then
    insert into public.mcat_config_versions
      (sha256, object_path, size_bytes, version, file_name, mcat_count, warnings, uploaded_by)
    values
      (p_sha256, v_path, p_size_bytes, coalesce(p_version, ''), p_file_name, p_mcat_count,
       coalesce(p_warnings, '[]'::jsonb), v_email)
    returning id into v_id;
  end if;

  insert into public.mcat_config_active (id, version_id, activated_by)
  values (true, v_id, v_email)
  on conflict (id) do update
    set version_id = excluded.version_id,
        activated_by = excluded.activated_by,
        activated_at = now();
  return v_id;
end;
$$;

-- Rollback: make an earlier recorded version active again.
create or replace function public.activate_mcat_config_version(p_version_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_indiamart_user() then
    raise exception 'Only signed-in @indiamart.com users can change the MCAT configuration';
  end if;
  if not exists (select 1 from public.mcat_config_versions where id = p_version_id) then
    raise exception 'MCAT configuration version % does not exist', p_version_id;
  end if;
  insert into public.mcat_config_active (id, version_id, activated_by)
  values (true, p_version_id, auth.jwt() ->> 'email')
  on conflict (id) do update
    set version_id = excluded.version_id,
        activated_by = excluded.activated_by,
        activated_at = now();
end;
$$;

revoke all on function public.activate_uploaded_mcat_config(text, bigint, text, text, integer, jsonb)
  from public, anon;
grant execute on function public.activate_uploaded_mcat_config(text, bigint, text, text, integer, jsonb)
  to authenticated;
revoke all on function public.activate_mcat_config_version(bigint) from public, anon;
grant execute on function public.activate_mcat_config_version(bigint) to authenticated;
