insert into public.platform_product_roadmap (
  roadmap_key,
  area,
  capability,
  code_ready,
  online_ready,
  development_status,
  branch_name,
  note,
  sort_order,
  started_at,
  updated_by_email,
  updated_at
)
values (
  'suite-support-federation',
  'Inbox',
  'Supporto suite federato: chat interne satelliti -> Inbox 4BID + guida interna HotelAccelerator',
  false,
  false,
  'in_progress',
  'feat/federated-support-inbox-v2',
  'Stato ufficiale: Codice. Satellite source of truth, proiezione Inbox idempotente, round-trip risposta, guida interna e segnalazioni. Demo/Tenant reale richiedono deploy coordinato e collaudo end-to-end.',
  49,
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
  note = excluded.note,
  updated_by_email = excluded.updated_by_email,
  updated_at = excluded.updated_at;
