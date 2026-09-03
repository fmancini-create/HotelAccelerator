# Identita operatore IA tenant

## Decisione

L'agente IA di HotelAccelerator e' un operatore virtuale tenant-scoped, ma non e' un account umano e non possiede una identita Supabase Auth.

La configurazione vive in `ai_agent_settings`:

- `display_name`: nome leggibile dell'agente, default `Sofia`;
- `signature_html`: firma email personalizzata facoltativa;
- firma di default generata: `<Nome agente> / Assistente virtuale / <Nome struttura>`.

## Motivazione

Creare una riga fittizia in `admin_users` richiederebbe una falsa relazione con Auth e introdurrebbe rischi su login, ruoli, KPI e permessi. L'identita di sistema resta quindi separata dalle persone, pur essendo presentata nel prodotto come operatore virtuale.

## Email autopilot

`lib/ai/channels/email.ts` risolve l'identita IA del tenant una volta per batch e applica la firma con lo stesso helper `appendSignatureHtml` usato dalle email umane.

Questo chiude il percorso che prima inviava direttamente l'HTML generato dall'IA senza passare dal resolver firme.

## Sicurezza

- configurazione limitata al tenant attivo tramite `requireTenantAdmin`;
- firma sanitizzata lato server;
- nessun login e nessun ruolo umano creato per l'IA;
- nessun accesso cross-tenant;
- migrazione additiva e rollback semplice rimuovendo le due colonne se necessario.

## Stato

`Codice` dopo merge e CI. La prova con una nuova email autopilot reale e' necessaria per promuovere il comportamento firma a `Tenant reale`.
