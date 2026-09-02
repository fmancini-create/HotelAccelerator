-- Applied to the Santaddeo/HotelAccelerator sales CRM database.
-- Stores only the CRM<->4BID mapping/cache; 4BID remains authoritative for quotes.

create table if not exists public.deal_quotes (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  external_quote_id uuid not null,
  source_record_id text not null,
  quote_number text,
  public_url text,
  status text not null default 'draft',
  total_amount numeric,
  currency text not null default 'eur',
  sent_at timestamptz,
  last_synced_at timestamptz not null default now(),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (external_quote_id),
  unique (source_record_id)
);

create index if not exists deal_quotes_deal_idx on public.deal_quotes(deal_id, created_at desc);
create index if not exists deal_quotes_status_idx on public.deal_quotes(status);

alter table public.deal_quotes enable row level security;

create policy deal_quotes_service_role on public.deal_quotes
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create policy deal_quotes_superadmin_all on public.deal_quotes
  for all using (is_super_admin()) with check (is_super_admin());

create policy deal_quotes_agent_select on public.deal_quotes
  for select using (
    exists (
      select 1 from public.deals d
      join public.sales_agents a on a.id = d.agent_id
      where d.id = deal_quotes.deal_id and a.user_id = auth.uid()
    )
  );

create policy deal_quotes_agent_insert on public.deal_quotes
  for insert with check (
    exists (
      select 1 from public.deals d
      join public.sales_agents a on a.id = d.agent_id
      where d.id = deal_quotes.deal_id and a.user_id = auth.uid()
    )
  );

create policy deal_quotes_agent_update on public.deal_quotes
  for update using (
    exists (
      select 1 from public.deals d
      join public.sales_agents a on a.id = d.agent_id
      where d.id = deal_quotes.deal_id and a.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.deals d
      join public.sales_agents a on a.id = d.agent_id
      where d.id = deal_quotes.deal_id and a.user_id = auth.uid()
    )
  );

create policy deal_quotes_agent_delete on public.deal_quotes
  for delete using (
    exists (
      select 1 from public.deals d
      join public.sales_agents a on a.id = d.agent_id
      where d.id = deal_quotes.deal_id and a.user_id = auth.uid()
    )
  );
