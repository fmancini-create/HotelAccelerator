# Basi di conoscenza per canale

Ultimo aggiornamento: 2026-08-25

## Scopo

Nella pagina `/admin/channels`, subito sotto i canali di messaggistica, un amministratore associa una o piu' basi di conoscenza a ogni account Email, numero WhatsApp o bot Telegram. La prima base e' primaria e determina modalita', tono e soglia; il recupero delle informazioni usa tutte le basi collegate.

## Modello dati

- `messaging_channels` usa `channel_knowledge_bases`.
- `email_channels` usa `email_channel_knowledge_bases`.
- Entrambe le relazioni hanno foreign key verso il canale reale e `knowledge_bases`.
- La posizione e' ordinata e la sostituzione avviene in una transazione tramite RPC server-only.

La separazione e' necessaria: `channel_knowledge_bases.channel_id` ha una foreign key verso `messaging_channels` e non puo' accettare l'id di una casella email. Eliminare il vincolo avrebbe reso possibili riferimenti orfani.

## Autorizzazione e tenant

La UI non invia `property_id`. La route ricava il tenant dalla sessione, verifica che il canale e ogni base appartengano alla struttura attiva e poi chiama la funzione dedicata. Le due tabelle di relazione hanno RLS attiva, nessuna policy client e grant soltanto al `service_role`.

Le RPC `match_knowledge_chunks`, `match_knowledge_chunks_by_bases` e `set_channel_knowledge_bases` sono `SECURITY INVOKER` e server-only. `PUBLIC`, `anon` e `authenticated` non hanno `EXECUTE`; soltanto `service_role` puo' invocarle. In questo modo una chiamata PostgREST dal browser non puo' leggere chunk di un tenant arbitrario o cambiare le basi associate a un canale.

La migrazione `20260825112147_harden_knowledge_rpc_permissions.sql` contiene controlli che falliscono se una delle tre RPC torna `SECURITY DEFINER`, riacquista permessi client o perde il permesso server.

## Migrazione e ordine di rilascio

Applicare `supabase/migrations/20260821204030_add_email_channel_knowledge_bases.sql` prima di distribuire il codice che interroga le associazioni email. Applicare poi `supabase/migrations/20260825112147_harden_knowledge_rpc_permissions.sql` per chiudere la superficie RPC delle basi di conoscenza.

Rollback applicativo: ripristinare la lettura dei soli `messaging_channels`; la nuova tabella puo' restare inutilizzata. Rollback dati, solo dopo esportazione delle associazioni email: eliminare la funzione `set_email_channel_knowledge_bases` e poi la tabella `email_channel_knowledge_bases`.

La migrazione di hardening non richiede rollback applicativo: il backend continua a usare `service_role`. Ripristinare i grant client o `SECURITY DEFINER` riaprirebbe la vulnerabilita' e non e' considerato un rollback sicuro.
