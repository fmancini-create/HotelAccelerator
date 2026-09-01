-- Allinea il fallback del solo hub vocale 4BID alla coda operatore reale 820.
-- I tenant normali mantengono il fallback generico configurabile/default 200.
update public.voice_ivr_routes
set fallback_destination = '820',
    updated_at = now()
where hub_property_id = 'fe0e6052-f1b8-4752-9ade-812ceed90635'
  and ivr_path in ('1.1','1.2','1.3','1.4','2.1','2.2','2.3','2.4')
  and fallback_destination is distinct from '820';
