-- Social channels: extend the existing unified Inbox without creating a parallel inbox.
-- Only official provider capabilities are represented. LinkedIn page DMs are deliberately absent.

alter table public.messaging_channels
  drop constraint if exists messaging_channels_channel_type_check;

alter table public.messaging_channels
  add constraint messaging_channels_channel_type_check
  check (channel_type = any (array[
    'whatsapp'::text,
    'telegram'::text,
    'messenger'::text,
    'instagram'::text,
    'chat'::text,
    'x'::text,
    'linkedin'::text
  ]));

alter table public.conversations
  drop constraint if exists conversations_channel_check;

alter table public.conversations
  add constraint conversations_channel_check
  check (channel = any (array[
    'chat'::text,
    'whatsapp'::text,
    'email'::text,
    'telegram'::text,
    'messenger'::text,
    'instagram'::text,
    'x'::text,
    'linkedin'::text
  ]));

alter table public.conversations
  add column if not exists messaging_channel_id uuid null
    references public.messaging_channels(id) on delete set null;

alter table public.conversations
  add column if not exists external_thread_id text null;

create unique index if not exists conversations_social_thread_uidx
  on public.conversations(property_id, channel, external_thread_id)
  where external_thread_id is not null;

create index if not exists conversations_messaging_channel_idx
  on public.conversations(property_id, messaging_channel_id)
  where messaging_channel_id is not null;

create index if not exists messages_property_external_message_idx
  on public.messages(property_id, external_message_id)
  where external_message_id is not null;
