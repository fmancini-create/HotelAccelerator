-- Full Gmail label reconciliation is intentionally less frequent than the
-- five-minute message poll. This durable watermark makes the first run repair
-- legacy unread/status drift, then limits the heavier mailbox-wide pass to
-- once per hour per channel.

alter table public.email_channels
  add column if not exists gmail_state_reconciled_at timestamp with time zone,
  add column if not exists full_sync_start_history_id bigint;

comment on column public.email_channels.gmail_state_reconciled_at is
  'Last successful mailbox-wide Gmail label reconciliation.';

comment on column public.email_channels.full_sync_start_history_id is
  'Gmail history cursor captured before a resumable full sync; promoted only after the full scan completes.';
