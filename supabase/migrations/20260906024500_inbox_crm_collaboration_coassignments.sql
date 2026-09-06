-- Inbox: collaborazione esplicita sulla stessa conversazione.
-- Additiva: il lock esclusivo esistente resta la sorgente della presa in carico;
-- questa tabella abilita soltanto gli utenti esplicitamente coassegnati.

alter table public.conversation_locks
  add column if not exists typing_at timestamptz;

create table if not exists public.conversation_coassignments (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  target_kind text not null check (target_kind in ('conversation', 'gmail_thread')),
  target_key text not null,
  holder_key text not null,
  user_id uuid,
  user_key text not null,
  user_label text not null,
  granted_by uuid references public.admin_users(id) on delete set null,
  granted_by_key text not null,
  granted_by_label text,
  typing_at timestamptz,
  last_beat_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversation_coassignments_user_tenant_fk
    foreign key (user_id, property_id)
    references public.admin_users(id, property_id)
    on delete cascade,
  constraint conversation_coassignments_lock_fk
    foreign key (property_id, target_kind, target_key)
    references public.conversation_locks(property_id, target_kind, target_key)
    on delete cascade,
  constraint conversation_coassignments_target_user_un
    unique (property_id, target_kind, target_key, user_key)
);

create index if not exists conversation_coassignments_holder_idx
  on public.conversation_coassignments(property_id, target_kind, target_key, holder_key);

create index if not exists conversation_coassignments_user_idx
  on public.conversation_coassignments(property_id, user_id)
  where user_id is not null;

alter table public.conversation_coassignments enable row level security;

-- Backend-only: tutte le operazioni passano dalle route tenant-scoped del Core.
revoke all on table public.conversation_coassignments from anon, authenticated;
grant all on table public.conversation_coassignments to service_role;

alter table public.conversation_activity_log
  drop constraint if exists conversation_activity_log_action_check;

alter table public.conversation_activity_log
  add constraint conversation_activity_log_action_check check (
    action in (
      'lock_acquired',
      'lock_released',
      'lock_expired',
      'lock_taken_over',
      'draft_saved',
      'draft_discarded',
      'transfer_requested',
      'transfer_granted',
      'transfer_denied',
      'transfer_cancelled',
      'message_sent',
      'coassignment_granted',
      'coassignment_revoked',
      'crm_stage_changed'
    )
  );

comment on table public.conversation_coassignments is
  'Utenti esplicitamente autorizzati a collaborare su un lock Inbox attivo; eliminati automaticamente al rilascio del lock.';
