# Inbox full-text search — 2026-09-06

## Stato ufficiale

**Codice**.

Il motore database e' applicato sul progetto Supabase HotelAccelerator e verificato su dati reali. Il collegamento API e' nel branch `feat/inbox-full-text-search`; il passaggio a `Tenant reale` richiede merge/deploy e verifica dalla UI autenticata della Inbox.

## Problema verificato

La ricerca precedente di `InboxReadRepository.listConversations` cercava solo in:

- oggetto della conversazione;
- `contact_email` e `contact_name` denormalizzati;
- nome/email del contatto CRM.

Il contenuto di `messages.content` non partecipava alla ricerca. Sul database reale sono presenti oltre 11k conversazioni e circa 30k messaggi, con singoli corpi molto grandi: una scansione `ILIKE` dei body non e' una soluzione scalabile.

## Soluzione

- `messages.inbox_search_vector`: `tsvector` generato dal corpo del messaggio con configurazione PostgreSQL `simple`, adatta a contenuti multilingua senza assumere una sola lingua.
- `conversations.message_search_vector`: unione dei termini di tutti i messaggi della conversazione.
- `conversations.inbox_search_vector`: oggetto + mittente + termini dei messaggi.
- `contacts.inbox_search_vector`: nome + email + telefono.
- indice GIN sulle conversazioni e sui contatti.
- trigger `SECURITY INVOKER` con `search_path=''` per mantenere aggiornato l'indice quando un messaggio viene inserito, modificato, spostato o cancellato.
- RPC `search_inbox_conversation_ids` `SECURITY INVOKER`, eseguibile solo da `authenticated`/`service_role`.
- la RPC applica `property_id`, stato, canale/sottocanale, cartelle nascoste, filtri `high_priority`/`action_needed` e assegnazioni canale prima di restituire i risultati.
- l'API `/api/inbox/conversations` usa la FTS quando `search` e' valorizzato e mantiene il percorso legacy solo come fallback se la migration non esiste ancora nell'ambiente.
- input di ricerca normalizzato e limitato a 300 caratteri.
- materializzazione degli id a lotti da 125 per evitare `UND_ERR_HEADERS_OVERFLOW` gia' documentato dal repository con grandi query `.in(...)`.

## Verifiche eseguite

- Backfill completato: tutti i messaggi presenti hanno `inbox_search_vector` valorizzato.
- Ricerca su parola presente solo nel corpo (`aggiornati`): conversazione trovata dal nuovo motore e non dai vecchi campi ricercabili.
- Tenant isolation: query di controllo con un `property_id` reale ha prodotto `0` risultati appartenenti ad altri tenant.
- Privilegi RPC: `anon_can_execute=false`, `authenticated_can_execute=true`.
- Misura indicativa su dati reali: ricerca FTS di prova ~98 ms lato database per una query con limite 50.
- Security advisor rilanciato dopo le DDL: il warning introdotto dall'aggregato temporaneo per il backfill e' stato rimosso; restano warning preesistenti del progetto non appartenenti a questa modifica.

## Migrazioni

1. `20260906001338_inbox_full_text_search_v2.sql`
2. `20260906001528_inbox_full_text_search_safe_channel_match.sql`
3. `20260906001907_inbox_full_text_search_drop_aggregate.sql`
4. `20260906002021_inbox_full_text_search_filter_compat.sql`

Le versioni corrispondono alla migration history del progetto Supabase di produzione.

## Rollback

Il percorso applicativo e' backward-compatible: rimuovendo/rollbackando il collegamento FTS dall'API, `InboxReadRepository` mantiene la ricerca legacy per oggetto/mittente/contatto.

Per rollback completo dello schema, nell'ordine:

1. rimuovere i trigger `inbox_search_message_insert_delete` e `inbox_search_message_update`;
2. rimuovere le funzioni `search_inbox_conversation_ids` e `inbox_sync_conversation_search_from_message`;
3. rimuovere gli indici GIN creati dalla feature;
4. rimuovere le tre colonne `inbox_search_vector`/`message_search_vector` aggiunte dalla feature.

Il rollback dello schema non elimina messaggi, conversazioni o contatti: le colonne sono derivate e l'intervento e' additivo.

## Limiti residui / prossimo step

- La ricerca e' lessicale full-text, non semantica: non cerca sinonimi basati su embedding.
- La UI usa ancora il campo esistente; un debounce/client-side UX dedicato puo' essere aggiunto separatamente senza modificare il contratto API.
- Dopo merge/deploy va verificato da Inbox con query su email, WhatsApp, Telegram e chat, inclusi account/utenti con accesso canali ristretto.
