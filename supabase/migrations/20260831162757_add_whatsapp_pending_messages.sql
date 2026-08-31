create table if not exists public.whatsapp_pending_messages (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  messaging_channel_id uuid not null references public.messaging_channels(id) on delete restrict,
  to_phone text not null,
  body text not null,
  operator_admin_user_id uuid,
  operator_actor_key text,
  operator_label text not null,
  status text not null default 'awaiting_acceptance'
    check (status in ('awaiting_acceptance','sending','sent','declined','failed_template','failed_delivery','expired')),
  template_name text not null,
  template_language text not null default 'it',
  template_message_id text,
  sent_message_id text,
  accepted_at timestamptz,
  declined_at timestamptz,
  sent_at timestamptz,
  expires_at timestamptz not null,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists whatsapp_pending_messages_property_status_idx
  on public.whatsapp_pending_messages(property_id, status, created_at desc);

create index if not exists whatsapp_pending_messages_conversation_idx
  on public.whatsapp_pending_messages(conversation_id, created_at desc);

create unique index if not exists whatsapp_pending_messages_one_active_per_conversation_idx
  on public.whatsapp_pending_messages(conversation_id)
  where status in ('awaiting_acceptance','sending','failed_delivery');

alter table public.whatsapp_pending_messages enable row level security;

drop policy if exists whatsapp_pending_messages_tenant_scoped on public.whatsapp_pending_messages;
create policy whatsapp_pending_messages_tenant_scoped
  on public.whatsapp_pending_messages
  for all
  to authenticated
  using (
    property_id = (select public.auth_property_id())
    or (select public.auth_is_super_admin())
  )
  with check (
    property_id = (select public.auth_property_id())
    or (select public.auth_is_super_admin())
  );

revoke all on public.whatsapp_pending_messages from anon;
grant select, insert, update, delete on public.whatsapp_pending_messages to authenticated;
