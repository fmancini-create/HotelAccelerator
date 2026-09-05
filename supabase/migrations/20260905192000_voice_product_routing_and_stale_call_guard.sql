-- Keep each 4BID prospect voice route scoped to its selected product and
-- avoid reusing the same synthetic phone_call forever for repeat callers.

do $$
declare
  hub_property uuid;
  hpa_kb uuid;
  manubot_kb uuid;
  santaddeo_kb uuid;
  accelerator_kb uuid;
begin
  select hub_property_id into hub_property
  from public.voice_ivr_routes
  where intent_key = 'prospect_information'
  order by created_at
  limit 1;

  if hub_property is null then
    return;
  end if;

  select id into hpa_kb from public.knowledge_bases
   where property_id = hub_property and upper(name) = 'HOTELPROFITAI' limit 1;
  select id into manubot_kb from public.knowledge_bases
   where property_id = hub_property and upper(name) = 'MANUBOT' limit 1;
  select id into santaddeo_kb from public.knowledge_bases
   where property_id = hub_property and upper(name) = 'SANTADDEO' limit 1;
  select id into accelerator_kb from public.knowledge_bases
   where property_id = hub_property and lower(name) like '%hotel accelerator%' limit 1;

  if hpa_kb is not null then
    update public.knowledge_bases
       set description = '[voice:hotel-profit-ai] Knowledge base dedicata a Hotel Profit AI.', updated_at = now()
     where id = hpa_kb;
    update public.knowledge_sources
       set knowledge_base_id = hpa_kb, updated_at = now()
     where property_id = hub_property
       and (lower(coalesce(title,'')) like '%hotelprofitai%' or lower(coalesce(url,'')) like '%hotelprofitai%');
    update public.voice_ivr_routes
       set primary_knowledge_base_id = hpa_kb, updated_at = now()
     where hub_property_id = hub_property and intent_key = 'prospect_information' and product_key = 'hotel-profit-ai';
  end if;

  if manubot_kb is not null then
    update public.knowledge_bases
       set description = '[voice:manubot] Knowledge base dedicata a ManuBot.', updated_at = now()
     where id = manubot_kb;
    update public.knowledge_sources
       set knowledge_base_id = manubot_kb, updated_at = now()
     where property_id = hub_property
       and (lower(coalesce(title,'')) like '%manubot%' or lower(coalesce(url,'')) like '%manubot%');
    update public.voice_ivr_routes
       set primary_knowledge_base_id = manubot_kb, updated_at = now()
     where hub_property_id = hub_property and intent_key = 'prospect_information' and product_key = 'manubot';
  end if;

  if santaddeo_kb is not null then
    update public.knowledge_bases
       set description = regexp_replace(coalesce(description,''), '\s*\[voice:santaddeo-rms\]\s*', ' ', 'gi') || ' [voice:santaddeo-rms]', updated_at = now()
     where id = santaddeo_kb;
    update public.voice_ivr_routes
       set primary_knowledge_base_id = santaddeo_kb, updated_at = now()
     where hub_property_id = hub_property and intent_key = 'prospect_information' and product_key = 'santaddeo-rms';
  end if;

  if accelerator_kb is not null then
    update public.knowledge_bases
       set description = regexp_replace(coalesce(description,''), '\s*\[voice:hotel-accelerator\]\s*', ' ', 'gi') || ' [voice:hotel-accelerator]', updated_at = now()
     where id = accelerator_kb;
    update public.voice_ivr_routes
       set primary_knowledge_base_id = accelerator_kb, updated_at = now()
     where hub_property_id = hub_property and intent_key = 'prospect_information' and product_key = 'hotel-accelerator';
  end if;
end $$;

create or replace function public.enforce_voice_prospect_product_kb()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  kb_description text;
  expected_marker text;
begin
  if new.intent_key <> 'prospect_information' or new.primary_knowledge_base_id is null then
    return new;
  end if;

  select description into kb_description
    from public.knowledge_bases
   where id = new.primary_knowledge_base_id
     and property_id = new.hub_property_id;

  expected_marker := '[voice:' || new.product_key || ']';
  if kb_description is null or position(lower(expected_marker) in lower(kb_description)) = 0 then
    raise exception 'Knowledge base non coerente con il prodotto vocale %', new.product_key
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_voice_prospect_product_kb on public.voice_ivr_routes;
create trigger trg_enforce_voice_prospect_product_kb
before insert or update of intent_key, product_key, primary_knowledge_base_id, hub_property_id
on public.voice_ivr_routes
for each row execute function public.enforce_voice_prospect_product_kb();

create or replace function public.reset_stale_shared_pbx_voice_call()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Without a provider call-id the voice bridge keeps one short-lived hint per
  -- caller. A clearly idle hint must not make a later phone call overwrite the
  -- previous transcript. Ninety seconds is deliberately conservative so normal
  -- pauses inside one conversation do not split the call.
  if old.phone_call_id is not null
     and new.last_seen_at is not null
     and old.last_seen_at is not null
     and new.last_seen_at > old.last_seen_at + interval '90 seconds' then
    new.phone_call_id := null;
    new.consumed_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reset_stale_shared_pbx_voice_call on public.telephony_call_route_hints;
create trigger trg_reset_stale_shared_pbx_voice_call
before update of last_seen_at
on public.telephony_call_route_hints
for each row execute function public.reset_stale_shared_pbx_voice_call();