-- Tracks the cross-product support federation while the coordinated PRs are in review.
-- The capability is not marked online here: production verification remains a separate gate.
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
  'feat/federated-support-inbox-v1',
  'Stato ufficiale: Codice. Contratto S2S e proiezione Inbox idempotente, guida interna HotelAccelerator e federazione feedback Santaddeo/HotelProfitAI sono implementati nei branch coordinati; handoff umano satellite e round-trip risposta richiedono il completamento dei relativi hook prima del merge.',
  49,
  now(),
  'repo-sync',
  now()
)
on conflict (roadmap_key) do update set
  area = excluded.area,
  capability = excluded.capability,
  branch_name = excluded.branch_name,
  note = excluded.note,
  development_status = case
    when public.platform_product_roadmap.online_ready then public.platform_product_roadmap.development_status
    else 'in_progress'
  end,
  started_at = coalesce(public.platform_product_roadmap.started_at, excluded.started_at),
  updated_by_email = excluded.updated_by_email,
  updated_at = excluded.updated_at;
