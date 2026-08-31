-- A network/process failure after an outbound WhatsApp request may leave the
-- external outcome unknowable. Keep that state distinct from a confirmed
-- failure so automatic retries cannot duplicate a guest message.

alter table public.whatsapp_pending_messages
  drop constraint if exists whatsapp_pending_messages_status_check;

alter table public.whatsapp_pending_messages
  add constraint whatsapp_pending_messages_status_check
  check (
    status in (
      'awaiting_acceptance',
      'sending',
      'sent',
      'declined',
      'failed_template',
      'failed_delivery',
      'delivery_unknown',
      'expired'
    )
  );

comment on column public.whatsapp_pending_messages.status is
  'Delivery lifecycle. delivery_unknown is terminal/manual-review and is never retried automatically, because Meta may have accepted the prior request before a transport/process failure.';
