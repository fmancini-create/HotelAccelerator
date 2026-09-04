# Identita degli utenti virtuali IA

## Decisione

L'identita IA non e' globale per tenant. **Ogni base di conoscenza possiede esattamente un utente virtuale IA**.

Quando viene creata una riga in `knowledge_bases`, il database crea automaticamente la relativa riga in `ai_virtual_users`.

L'utente virtuale:

- ha un nome personalizzabile (`display_name`);
- ha una firma email HTML personalizzabile (`signature_html`);
- non e' un account umano;
- non possiede una identita Supabase Auth;
- non puo' effettuare login o ricevere ruoli/permessi di `admin_users`;
- appartiene sempre allo stesso tenant e alla stessa knowledge base tramite `property_id` + `knowledge_base_id`.

Il nome iniziale non e' un nome di persona deciso dalla piattaforma. Viene generato come `Assistente <nome base>` e puo' essere rinominato dal tenant (es. `Giulia`, `Marco SPA`, `Booking Assistant`).

La firma automatica di fallback e':

`<Nome utente virtuale> / Assistente virtuale / <Nome struttura>`.

## Perche una identita per knowledge base

Le basi rappresentano competenze e contesti diversi. Un resort puo' avere, per esempio, una base Reception, una SPA e una Ristorante: ciascuna puo' avere una propria persona virtuale, un proprio nome e una propria firma.

Il canale puo' usare piu basi per il retrieval, ma la **base primaria** determina:

1. comportamento e modalita IA;
2. persona/tono;
3. utente virtuale che firma e a cui viene attribuita la risposta.

Questo evita che un'unica identita tenant-wide risponda indistintamente a fonti e reparti diversi.

## Modello dati

`ai_virtual_users` e' la sorgente di verita delle identita virtuali:

- `id`: identificativo interno dell'utente virtuale;
- `property_id`: tenant proprietario;
- `knowledge_base_id`: base proprietaria, univoca;
- `display_name`: nome mostrato;
- `signature_html`: firma email personalizzata opzionale;
- timestamp di creazione/aggiornamento.

La migrazione `20260904093131_ai_virtual_user_per_knowledge_base.sql`:

- crea la tabella;
- abilita RLS;
- nega accesso Data API a `public`, `anon` e `authenticated`;
- concede accesso al solo `service_role`;
- crea il trigger automatico su `knowledge_bases`;
- esegue il backfill delle basi gia esistenti.

La migrazione `20260904094216_retire_tenant_wide_ai_name_default.sql` rimuove inoltre il default legacy `Sofia` da `ai_agent_settings.display_name`, senza cancellare colonne o dati.

Le colonne `display_name` e `signature_html` introdotte precedentemente in `ai_agent_settings` restano temporaneamente solo per compatibilita di schema e non sono piu la sorgente operativa dell'identita IA. La loro rimozione futura richiedera una decisione/migrazione separata.

## Runtime e Inbox

`runAutopilot` risolve l'utente virtuale della base primaria prima di generare/inviare una risposta.

Ogni messaggio IA salvato in `messages` porta:

- `sender_type = agent`;
- `sender_name = <display_name utente virtuale>`;
- `metadata.ai_knowledge_base_id`;
- `metadata.ai_virtual_user_id`;
- `metadata.ai_virtual_user_name`.

La stessa identita viene mantenuta anche nei fallback e nel flusso di handoff verso lo staff.

## Email autopilot

`lib/ai/channels/email.ts` riceve da `runAutopilot` il contesto dell'utente virtuale della base primaria e applica **la firma di quella specifica IA** con `appendSignatureHtml`.

Non esiste piu un'identita tenant-wide `Sofia` usata dal runtime, e lo schema legacy non assegna piu quel nome come default.

## Sicurezza e isolamento tenant

- lettura/scrittura configurazione consentita solo a tenant admin tramite endpoint server-side scoped alla base e al `property_id` attivo;
- la firma viene sanitizzata lato server;
- nessun login, ruolo umano o record fittizio in `admin_users`;
- nessun accesso diretto dal browser alla tabella `ai_virtual_users`;
- la cancellazione della knowledge base elimina automaticamente il relativo utente virtuale (`ON DELETE CASCADE`);
- nessun accesso cross-tenant: tutte le lookup richiedono insieme `knowledge_base_id` e `property_id`.

## Stato e verifica richiesta

Stato della capability sul branch: `Codice` solo dopo CI/build positivi.

Prima di promuoverla a `Tenant reale` servono almeno queste prove su un tenant reale:

1. creare una nuova knowledge base e verificare la creazione automatica dell'utente virtuale;
2. rinominare l'utente e personalizzarne la firma;
3. collegare la base come primaria a un canale email e verificare nome + firma della risposta;
4. verificare in Inbox che messaggi normali, fallback e handoff risultino attribuiti allo stesso utente virtuale;
5. verificare che una seconda base dello stesso tenant usi un'identita diversa;
6. verificare che un altro tenant non possa leggere o modificare l'identita.

## Rollback

La modifica e' additiva. Un rollback applicativo puo' smettere di usare `ai_virtual_users` senza cancellare dati. La rimozione della tabella o delle identita e' distruttiva e va eseguita solo con migrazione esplicita e conferma.
