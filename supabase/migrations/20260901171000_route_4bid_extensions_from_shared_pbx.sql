-- 4BID and Villa I Barronci share the same 3CX PBX.
-- Extensions 200 and 820 belong to the 4BID tenant and must never surface in
-- Villa I Barronci's call register. The application journal routes new calls by
-- tenant-owned extension labels; this migration makes the production mapping
-- reproducible and repairs the legacy rows written before shared-PBX routing.

insert into public.telephony_extension_labels (property_id, extension, label, kind)
select id, '200', '4BID Operatore', 'other'
from public.properties
where slug = '4bid'
on conflict do nothing;

insert into public.telephony_extension_labels (property_id, extension, label, kind)
select id, '820', '4BID Operatore', 'group'
from public.properties
where slug = '4bid'
on conflict do nothing;

update public.phone_calls
set
  property_id = (select id from public.properties where slug = '4bid'),
  contact_id = null,
  user_id = null
where property_id = (select id from public.properties where slug = 'villa-i-barronci')
  and extension in ('200', '820');
