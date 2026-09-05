-- KPI commerciali per operatore.
--
-- La Inbox resta la fonte delle conversazioni, ma le attribuzioni commerciali
-- vivono in un read model separato. In questo modo una ricostruzione storica da
-- Gmail non inserisce messaggi SENT dentro `messages` e non altera unread/KPI.
-- Solo le attribuzioni `confirmed` entrano nei KPI personali.

alter table public.dashboard_user_settings
  add column if not exists closed_deals_target integer,
  add column if not exists closed_revenue_target_cents integer,
  add column if not exists custom_goal_metric text,
  add column if not exists custom_goal_label text,
  add column if not exists custom_goal_target integer,
  add column if not exists custom_goal_period text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'dashboard_closed_deals_target_positive') then
    alter table public.dashboard_user_settings
      add constraint dashboard_closed_deals_target_positive
      check (closed_deals_target is null or closed_deals_target > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'dashboard_closed_revenue_target_positive') then
    alter table public.dashboard_user_settings
      add constraint dashboard_closed_revenue_target_positive
      check (closed_revenue_target_cents is null or closed_revenue_target_cents > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'dashboard_custom_goal_target_positive') then
    alter table public.dashboard_user_settings
      add constraint dashboard_custom_goal_target_positive
      check (custom_goal_target is null or custom_goal_target > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'dashboard_custom_goal_metric_check') then
    alter table public.dashboard_user_settings
      add constraint dashboard_custom_goal_metric_check
      check (custom_goal_metric is null or custom_goal_metric in ('quotes_sent','completed_calls','completed_tasks','conversion_rate'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'dashboard_custom_goal_period_check') then
    alter table public.dashboard_user_settings
      add constraint dashboard_custom_goal_period_check
      check (custom_goal_period is null or custom_goal_period in ('workday','30_days'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'dashboard_custom_goal_label_length') then
    alter table public.dashboard_user_settings
      add constraint dashboard_custom_goal_label_length
      check (custom_goal_label is null or char_length(custom_goal_label) <= 80);
  end if;
end $$;

comment on column public.dashboard_user_settings.closed_deals_target is
  'Target individuale di trattative chiuse vinte nella finestra mobile di 30 giorni.';
comment on column public.dashboard_user_settings.closed_revenue_target_cents is
  'Budget/target individuale di valore chiuso vinto, in centesimi, nella finestra mobile di 30 giorni.';
comment on column public.dashboard_user_settings.custom_goal_metric is
  'Metrica misurabile scelta dal tenant admin per l obiettivo extra.';
comment on column public.dashboard_user_settings.custom_goal_period is
  'Periodo dell obiettivo extra: giornata locale della struttura oppure 30 giorni mobili.';

-- I riferimenti compositi fanno fallire chiuso un eventuale inserimento service
-- role che provi ad associare una richiesta/conversazione di un altro tenant.
create unique index if not exists contact_date_requests_property_id_id_uidx
  on public.contact_date_requests(property_id, id);
create unique index if not exists conversations_property_id_id_uidx
  on public.conversations(property_id, id);

create table if not exists public.crm_operator_sales_attributions (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  date_request_id uuid not null,
  conversation_id uuid,
  user_id uuid,
  quote_sent_at timestamptz,
  closed_at timestamptz,
  amount_cents integer,
  attribution_source text not null default 'gmail_scan',
  confidence smallint not null default 0,
  verification_status text not null default 'unattributed',
  quote_message_id text,
  close_message_id text,
  evidence jsonb not null default '{}'::jsonb,
  scanned_at timestamptz not null default now(),
  verified_by uuid,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_operator_sales_date_request_tenant_fkey
    foreign key (property_id, date_request_id)
    references public.contact_date_requests(property_id, id)
    on delete cascade,
  constraint crm_operator_sales_conversation_tenant_fkey
    foreign key (property_id, conversation_id)
    references public.conversations(property_id, id)
    on delete set null (conversation_id),
  constraint crm_operator_sales_user_tenant_fkey
    foreign key (property_id, user_id)
    references public.admin_users(property_id, id)
    on delete set null (user_id),
  constraint crm_operator_sales_verified_by_fkey
    foreign key (verified_by) references public.admin_users(id) on delete set null,
  constraint crm_operator_sales_amount_positive
    check (amount_cents is null or amount_cents > 0),
  constraint crm_operator_sales_confidence_range
    check (confidence between 0 and 100),
  constraint crm_operator_sales_source_check
    check (attribution_source in ('gmail_scan','pipeline_stage','manual')),
  constraint crm_operator_sales_verification_check
    check (verification_status in ('confirmed','needs_review','unattributed','rejected')),
  constraint crm_operator_sales_confirmed_has_user
    check (verification_status <> 'confirmed' or user_id is not null),
  unique(property_id, date_request_id)
);

create index if not exists crm_operator_sales_user_period_idx
  on public.crm_operator_sales_attributions(property_id, user_id, closed_at desc)
  where verification_status = 'confirmed';
create index if not exists crm_operator_sales_quote_period_idx
  on public.crm_operator_sales_attributions(property_id, user_id, quote_sent_at desc)
  where verification_status = 'confirmed';
create index if not exists crm_operator_sales_review_idx
  on public.crm_operator_sales_attributions(property_id, verification_status, scanned_at desc);

comment on table public.crm_operator_sales_attributions is
  'Read model auditabile per attribuire preventivi e trattative chiuse a operatori senza alterare Inbox o outcome IA.';
comment on column public.crm_operator_sales_attributions.evidence is
  'Solo evidenza tecnica minima (match, id messaggi, segnali); non salvare il corpo completo delle email.';
comment on column public.crm_operator_sales_attributions.verification_status is
  'Solo confirmed entra nei KPI individuali; needs_review richiede controllo admin.';

alter table public.crm_operator_sales_attributions enable row level security;
revoke all on table public.crm_operator_sales_attributions from public, anon, authenticated;
grant select, insert, update, delete on table public.crm_operator_sales_attributions to service_role;
