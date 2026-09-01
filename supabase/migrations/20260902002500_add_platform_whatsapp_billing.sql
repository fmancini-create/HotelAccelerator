-- Platform-owned WhatsApp billing configuration.
--
-- This singleton is backend-only. Tenant users must never configure Meta billing,
-- payment methods, credit lines, system users or Graph credentials themselves.
-- Secrets remain in environment variables; this table stores only non-secret
-- identifiers and health/status metadata needed to provision tenant WABAs.

create table if not exists public.platform_whatsapp_billing (
  id text primary key default 'default',
  mode text not null default 'solution_partner_credit_line',
  business_id text not null,
  currency text not null default 'EUR',
  credit_line_id text,
  system_user_id text,
  status text not null default 'pending',
  last_error text,
  last_checked_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint platform_whatsapp_billing_singleton check (id = 'default'),
  constraint platform_whatsapp_billing_mode_check check (mode in ('solution_partner_credit_line')),
  constraint platform_whatsapp_billing_currency_check check (currency in ('AUD','EUR','GBP','IDR','INR','USD')),
  constraint platform_whatsapp_billing_status_check check (status in ('pending','ready','blocked','error'))
);

alter table public.platform_whatsapp_billing enable row level security;

revoke all on table public.platform_whatsapp_billing from anon, authenticated;
grant select, insert, update, delete on table public.platform_whatsapp_billing to service_role;

comment on table public.platform_whatsapp_billing is
  'Backend-only 4BID WhatsApp billing configuration. No tenant-facing access.';
comment on column public.platform_whatsapp_billing.business_id is
  '4BID Meta Business Portfolio ID used to discover system users and extended credit.';
comment on column public.platform_whatsapp_billing.credit_line_id is
  'Meta extended credit line ID discovered server-side; not a secret.';
comment on column public.platform_whatsapp_billing.system_user_id is
  'App-scoped Meta system user ID resolved from the platform system token.';
