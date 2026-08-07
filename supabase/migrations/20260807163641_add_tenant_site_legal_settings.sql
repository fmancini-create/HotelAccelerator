-- Tenant website legal settings remain on properties so the existing
-- authenticated, server-side settings flow stays the single owner.
alter table public.properties
  add column if not exists legal_rea text,
  add column if not exists legal_registry text,
  add column if not exists legal_share_capital text,
  add column if not exists site_privacy_policy text,
  add column if not exists site_cookie_policy text;

comment on column public.properties.site_privacy_policy is
  'Tenant-editable public Privacy Policy. Null uses the application default.';
comment on column public.properties.site_cookie_policy is
  'Tenant-editable public Cookie Policy. Null uses the application default.';

-- White Label is a paid entitlement, not a tenant-editable CMS preference.
insert into public.modules (
  key,
  name,
  description,
  icon,
  category,
  is_core,
  sort_order,
  is_available
)
values (
  'white_label',
  'White Label',
  'Rimuove la firma 4BID dai siti pubblici del tenant',
  'BadgeCheck',
  'addon',
  false,
  900,
  true
)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  is_core = excluded.is_core,
  is_available = excluded.is_available;
