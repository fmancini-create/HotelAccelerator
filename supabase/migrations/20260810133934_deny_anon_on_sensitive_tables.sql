-- Chiude l'accesso ANONIMO alle tabelle con dati di clienti e credenziali.
--
-- CONTESTO (misurato in produzione il 10/08/2026, non dedotto)
-- La chiave `NEXT_PUBLIC_SUPABASE_ANON_KEY` è per sua natura presente nel bundle
-- JS servito da www.hotelaccelerator.com. Con quella sola chiave, dall'esterno e
-- senza alcuna sessione, erano leggibili fra le altre cose:
--   - messages ............ 18.651 righe (testo delle conversazioni con gli ospiti)
--   - conversations ....... 6.966 righe
--   - contacts ............ 836 righe (email degli ospiti)
--   - email_channels ...... oauth_access_token e oauth_refresh_token VALORIZZATI,
--                           cioè accesso permanente alle caselle Gmail dei clienti
-- e su `platform_collaborators` l'INSERT anonimo NON era fermato da RLS (provato:
-- l'errore restituito era 23502, campo obbligatorio mancante, non 42501): un
-- estraneo poteva aggiungersi come collaboratore di piattaforma.
--
-- CAUSA
-- Le politiche esistenti sono permissive verso il ruolo `public` con condizione
-- vera. Molte hanno nomi che sembrano restrittivi ma non lo sono:
--   - `admin_users_service_role`, `command_logs_service_role`,
--     `embed_scripts_service_role` -> il nome dice service_role, il ruolo è `public`
--   - `Admins can manage contacts/messages/conversations` -> il nome dice Admins,
--     la condizione è `true` per `public`
--   - `admin_users_select_policy` -> ha un controllo reale, poi `OR true` che lo
--     annulla
-- Chi scorre l'elenco delle politiche le legge come protette. Non lo sono.
--
-- SCELTA: negare `anon`, NON `authenticated`
-- `lib/supabase/server.ts::createClient()` usa la chiave anonima con i cookie:
-- con una sessione il ruolo effettivo è `authenticated`, senza sessione è `anon`.
-- Le rotte dell'applicazione sono state misurate dall'esterno una per una e
-- rispondono 401 senza sessione, quindi girano come `authenticated`: negare il
-- solo `anon` chiude l'accesso da Internet senza toccare l'app.
--
-- Le poche rotte che girano davvero senza sessione (widget chat, impression,
-- rules, config dell'embed, refresh OAuth) sono state convertite a
-- `createServiceClient()` nello stesso commit: senza quella conversione questa
-- migrazione le romperebbe.
--
-- QUESTA MIGRAZIONE NON RISOLVE l'isolamento fra clienti diversi: un utente
-- autenticato del cliente A può ancora leggere i dati del cliente B, perché le
-- politiche per `authenticated` restano permissive. È il lavoro della Fase 2
-- (politiche per tenant + presidio sulle rotte API), volutamente separato per non
-- mescolare una chiusura urgente con un cambiamento ad ampio raggio.
--
-- Politica RESTRITTIVA: si somma in AND alle permissive esistenti, quindi le
-- neutralizza per `anon` senza doverle rimuovere (rimuoverle avrebbe richiesto di
-- ricostruire 86 politiche, con molto più rischio). `service_role` non è toccato.

do $$
declare
  t text;
begin
  foreach t in array array[
    -- identità e privilegi di piattaforma
    'admin_users',
    'platform_collaborators',
    'command_logs',
    -- dati degli ospiti
    'contacts',
    'contact_date_requests',
    'contact_imports',
    'contact_segment_members',
    'contact_segments',
    'contact_stays',
    'conversations',
    'messages',
    'events',
    'message_impressions',
    -- credenziali e configurazione dei canali
    'email_channels',
    'email_channel_assignments',
    'email_signatures',
    'email_signature_assignments',
    'email_labels',
    'channel_settings',
    'channel_user_assignments',
    'messaging_channels',
    'pms_integrations',
    'embed_scripts',
    -- contenuti e automazioni
    'canned_responses',
    'message_rules',
    'message_templates',
    'email_campaigns',
    'email_campaign_recipients',
    -- gruppi e permessi
    'user_groups',
    'user_group_members',
    'user_channel_permissions',
    'group_channel_permissions'
  ]
  loop
    -- idempotente: la migrazione può essere rieseguita senza errori
    execute format('drop policy if exists "deny_anon" on public.%I', t);
    execute format(
      'create policy "deny_anon" on public.%I as restrictive for all to anon using (false) with check (false)',
      t
    );
    execute format('revoke all privileges on table public.%I from anon', t);
  end loop;
end
$$;

-- NON toccate di proposito:
--   categories, photo_category, photo_categories
-- Sono tabelle di sola consultazione (elenchi di categorie per la galleria
-- fotografica), non contengono dati di ospiti né credenziali, e sono interrogate
-- dal browser da `app/admin/gallery/page.tsx` e `app/admin/photos/page.tsx`
-- (`photo_category` anche in scrittura). Chiuderle avrebbe rotto quelle pagine
-- senza chiudere nulla di sensibile.
