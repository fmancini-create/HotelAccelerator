-- The unique index contacts_property_email_unique_idx is on lower(email), but
-- every lookup in lib/crm/auto-capture.ts compares against a lowercased value
-- with an exact match. A row stored with uppercase characters was therefore
-- never found: the insert then tripped the unique index, the recovery re-read
-- missed it for the same reason, and the caller ended up with contactId null.
-- The conversation stayed unlinked from its contact and the request logged an
-- error while still returning 200.
--
-- Measured on production before this migration: 27 of 832 contacts with an
-- email (3.25%) held uppercase characters.
--
-- Sending is unaffected: outbound mail uses conversations.contact_email, not
-- contacts.email.

update public.contacts
set email = lower(email)
where email is not null
  and email <> ''
  and email <> lower(email);

-- Keep the invariant the code and the unique index already assume, so a future
-- import cannot reintroduce the mismatch.
create or replace function public.contacts_normalize_email()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.email is not null then
    new.email := lower(btrim(new.email));
  end if;
  return new;
end;
$$;

comment on function public.contacts_normalize_email() is
  'Lowercases and trims contacts.email so it always matches the lower(email) unique index and the lookups in lib/crm/auto-capture.ts.';

drop trigger if exists contacts_normalize_email_trg on public.contacts;

create trigger contacts_normalize_email_trg
before insert or update of email on public.contacts
for each row
execute function public.contacts_normalize_email();
