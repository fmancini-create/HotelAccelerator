# Basi di conoscenza per canale

Ultimo aggiornamento: 2026-08-21

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

## Migrazione e ordine di rilascio

Applicare `supabase/migrations/20260821204030_add_email_channel_knowledge_bases.sql` prima di distribuire il codice che interroga le associazioni email.

Rollback applicativo: ripristinare la lettura dei soli `messaging_channels`; la nuova tabella puo' restare inutilizzata. Rollback dati, solo dopo esportazione delle associazioni email: eliminare la funzione `set_email_channel_knowledge_bases` e poi la tabella `email_channel_knowledge_bases`.
