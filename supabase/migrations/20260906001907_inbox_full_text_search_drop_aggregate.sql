-- Remove the temporary public aggregate used only for the initial backfill.
-- The trigger rebuilds vectors explicitly so no mutable-search_path aggregate
-- remains exposed in the public schema.
-- Production migration version: 20260906001907.

create or replace function public.inbox_sync_conversation_search_from_message()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  old_property_id uuid;
  old_conversation_id uuid;
  rebuilt_vector tsvector;
  row_vector record;
begin
  if tg_op = 'INSERT' then
    update public.conversations as c
    set message_search_vector = c.message_search_vector || pg_catalog.strip(new.inbox_search_vector)
    where c.property_id = new.property_id
      and c.id = new.conversation_id;
    return new;
  end if;

  if tg_op = 'DELETE' then
    rebuilt_vector := ''::tsvector;
    for row_vector in
      select m.inbox_search_vector
      from public.messages as m
      where m.property_id = old.property_id
        and m.conversation_id = old.conversation_id
    loop
      rebuilt_vector := rebuilt_vector || pg_catalog.strip(row_vector.inbox_search_vector);
    end loop;

    update public.conversations as c
    set message_search_vector = rebuilt_vector
    where c.property_id = old.property_id
      and c.id = old.conversation_id;
    return old;
  end if;

  old_property_id := old.property_id;
  old_conversation_id := old.conversation_id;

  rebuilt_vector := ''::tsvector;
  for row_vector in
    select m.inbox_search_vector
    from public.messages as m
    where m.property_id = new.property_id
      and m.conversation_id = new.conversation_id
  loop
    rebuilt_vector := rebuilt_vector || pg_catalog.strip(row_vector.inbox_search_vector);
  end loop;

  update public.conversations as c
  set message_search_vector = rebuilt_vector
  where c.property_id = new.property_id
    and c.id = new.conversation_id;

  if old_property_id is distinct from new.property_id
     or old_conversation_id is distinct from new.conversation_id then
    rebuilt_vector := ''::tsvector;
    for row_vector in
      select m.inbox_search_vector
      from public.messages as m
      where m.property_id = old_property_id
        and m.conversation_id = old_conversation_id
    loop
      rebuilt_vector := rebuilt_vector || pg_catalog.strip(row_vector.inbox_search_vector);
    end loop;

    update public.conversations as c
    set message_search_vector = rebuilt_vector
    where c.property_id = old_property_id
      and c.id = old_conversation_id;
  end if;

  return new;
end;
$$;

drop aggregate if exists public.inbox_tsvector_union(tsvector);
