-- Fix mutable search paths on internal trigger functions.
-- The conversation trigger is recreated because it references a table and must
-- use a schema-qualified name when the search path is empty.

create or replace function public.update_conversation_on_message()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  update public.conversations
  set
    last_message_at = new.created_at,
    unread_count = case
      when new.sender_type = 'customer' then unread_count + 1
      else unread_count
    end,
    updated_at = now()
  where id = new.conversation_id;
  return new;
end;
$function$;

alter function public.update_cms_pages_updated_at() set search_path = '';
alter function public.update_embed_scripts_updated_at() set search_path = '';
alter function public.update_todos_updated_at() set search_path = '';
alter function public.set_updated_at() set search_path = '';
alter function public.email_channels_default_name() set search_path = '';

-- Trigger functions are internal implementation details, not public RPCs.
revoke execute on function public.update_conversation_on_message() from public, anon, authenticated;
revoke execute on function public.update_cms_pages_updated_at() from public, anon, authenticated;
revoke execute on function public.update_embed_scripts_updated_at() from public, anon, authenticated;
revoke execute on function public.update_todos_updated_at() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.email_channels_default_name() from public, anon, authenticated;

grant execute on function public.update_conversation_on_message() to service_role;
grant execute on function public.update_cms_pages_updated_at() to service_role;
grant execute on function public.update_embed_scripts_updated_at() to service_role;
grant execute on function public.update_todos_updated_at() to service_role;
grant execute on function public.set_updated_at() to service_role;
grant execute on function public.email_channels_default_name() to service_role;
