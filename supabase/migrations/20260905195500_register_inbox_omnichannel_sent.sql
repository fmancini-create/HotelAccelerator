-- Roadmap registration for the dedicated omnichannel Sent development.
-- code_ready / online_ready remain false until merge to main and verified production deploy.
insert into public.platform_product_roadmap (
  roadmap_key,
  area,
  capability,
  code_ready,
  online_ready,
  development_status,
  branch_name,
  pr_number,
  note,
  sort_order,
  started_at,
  updated_by_email,
  updated_at
)
values (
  'inbox-omnichannel-sent',
  'Inbox',
  'Inviati omnicanale: Email, WhatsApp, Telegram, Chat e canali operativi in una vista unica',
  false,
  false,
  'in_progress',
  'feat/inbox-omnichannel-sent',
  416,
  'Stato ufficiale: Codice sul branch dedicato. La vista legge solo outbound realmente persistiti da HotelAccelerator e mantiene la cartella SENT nativa del provider dentro Cartelle email. Tenant reale richiede collaudo su almeno due canali e verifica isolamento utente/tenant.',
  47,
  now(),
  'repo-sync',
  now()
)
on conflict (roadmap_key) do update set
  area = excluded.area,
  capability = excluded.capability,
  code_ready = excluded.code_ready,
  online_ready = excluded.online_ready,
  development_status = excluded.development_status,
  branch_name = excluded.branch_name,
  pr_number = excluded.pr_number,
  note = excluded.note,
  sort_order = excluded.sort_order,
  updated_by_email = excluded.updated_by_email,
  updated_at = excluded.updated_at;
