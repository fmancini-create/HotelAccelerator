create table if not exists public.platform_product_roadmap (
  roadmap_key text primary key,
  area text not null,
  capability text not null,
  code_ready boolean not null default false,
  online_ready boolean not null default false,
  note text,
  sort_order integer not null default 0,
  updated_by_email text,
  updated_at timestamptz not null default now(),
  constraint platform_product_roadmap_online_requires_code check (not online_ready or code_ready)
);

create table if not exists public.platform_product_roadmap_audit (
  id uuid primary key default gen_random_uuid(),
  roadmap_key text not null,
  actor_email text not null,
  previous_code_ready boolean not null,
  previous_online_ready boolean not null,
  next_code_ready boolean not null,
  next_online_ready boolean not null,
  changed_at timestamptz not null default now()
);

create index if not exists idx_platform_product_roadmap_sort on public.platform_product_roadmap(sort_order, area, roadmap_key);
create index if not exists idx_platform_product_roadmap_audit_key_time on public.platform_product_roadmap_audit(roadmap_key, changed_at desc);

alter table public.platform_product_roadmap enable row level security;
alter table public.platform_product_roadmap_audit enable row level security;

revoke all privileges on table public.platform_product_roadmap from anon, authenticated;
revoke all privileges on table public.platform_product_roadmap_audit from anon, authenticated;
grant select, insert, update, delete on table public.platform_product_roadmap to service_role;
grant select, insert on table public.platform_product_roadmap_audit to service_role;

create policy "platform_product_roadmap_backend_only_deny"
  on public.platform_product_roadmap as restrictive for all to anon, authenticated
  using (false) with check (false);

create policy "platform_product_roadmap_audit_backend_only_deny"
  on public.platform_product_roadmap_audit as restrictive for all to anon, authenticated
  using (false) with check (false);

insert into public.platform_product_roadmap (roadmap_key, area, capability, code_ready, online_ready, sort_order)
values
  ('core-tenant','Core','Tenant, utenti, ruoli e permessi',false,false,10),
  ('suite-access','Core','Accesso unico alla suite per ruolo, modulo e abbonamento',false,false,20),
  ('inbox-gmail','Inbox','Gmail: OAuth, import, sincronizzazione e riconciliazione',true,true,30),
  ('inbox-omnichannel','Inbox','Inbox omnicanale: email, WhatsApp, social, OTA e VoIP',false,false,40),
  ('operator-presence','Inbox','Presenza operatore e instradamento in tempo reale',true,false,50),
  ('ai-voice','AI','Assistente vocale AI per chiamate e messaggi vocali',false,false,60),
  ('conversation-analysis','AI','Analisi conversazioni, richieste, qualita e insight di mercato',false,false,70),
  ('crm','CRM','CRM ospite unico, deduplica, soggiorni, consensi e segmenti',false,false,80),
  ('marketing-hub','Marketing','Marketing Hub AI per contenuti social e comunicazioni',false,false,90),
  ('ads','Marketing','Campagne Meta e Google Ads con interfaccia semplificata',false,false,100),
  ('email-marketing','Marketing','Email marketing automatico basato sui profili CRM',false,false,110),
  ('cms','CMS','Sito e CMS AI-first multilingua con SEO/GEO',false,false,120),
  ('booking','Booking','Booking widget, preventivi, pagamenti, alternative ed extra',false,false,130),
  ('hr','HR','Dipendenti, reparti e turni',true,false,140),
  ('hr-time','HR','Check-in/check-out dipendente con geolocalizzazione',false,false,150),
  ('work-session','HR','Sessione di lavoro collegata a turni, presenza e assegnazione attivita',false,false,160),
  ('santaddeo','Santaddeo','RMS, pricing, forecast e intelligence domanda',false,false,170),
  ('hotelprofitai','HotelProfitAI','Controllo economico, fatture, banche e finanza',false,false,180),
  ('manubot','ManuBot','Manutenzioni, attivita operative e interventi programmati',false,false,190),
  ('notifications-audit','Core','Centro notifiche, audit trail e health connettori',false,false,200),
  ('billing','Core','Billing SaaS, piani, entitlement e onboarding',false,false,210),
  ('roadmap','Governance','Roadmap prodotto Super Admin',true,false,220)
on conflict (roadmap_key) do update set
  area = excluded.area,
  capability = excluded.capability,
  sort_order = excluded.sort_order;

comment on table public.platform_product_roadmap is 'Platform-global product capability checklist managed only through authenticated Super Admin server routes.';
comment on table public.platform_product_roadmap_audit is 'Append-only audit history for Super Admin roadmap status changes.';
