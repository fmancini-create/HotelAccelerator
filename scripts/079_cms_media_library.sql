-- CMS media library: tenant-scoped metadata + public image bucket.
-- Additive and backward-compatible.

create extension if not exists pgcrypto;

create table if not exists public.cms_media_assets (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  storage_path text not null unique,
  public_url text not null,
  original_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  alt_text text,
  width integer,
  height integer,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cms_media_assets_mime_check check (
    mime_type in ('image/jpeg','image/png','image/webp','image/avif','image/gif')
  ),
  constraint cms_media_assets_alt_length_check check (
    alt_text is null or char_length(alt_text) <= 500
  )
);

create index if not exists cms_media_assets_property_created_idx
  on public.cms_media_assets(property_id, created_at desc);

alter table public.cms_media_assets enable row level security;

-- Application access is intentionally server-side through an authenticated API
-- using the service-role client after tenant resolution. No direct client policy.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cms-media',
  'cms-media',
  true,
  10485760,
  array['image/jpeg','image/png','image/webp','image/avif','image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

comment on table public.cms_media_assets is
'Tenant-scoped metadata for CMS images stored in the public cms-media bucket. Writes and listings are server-side only.';
