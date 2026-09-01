# CRM tenant workspaces — implementazione

Ultimo aggiornamento: 2026-09-01

## Stato

`Codice` sul branch `feat/crm-tenant-workspaces`.

Non promuovere a `Tenant reale` finché le migrazioni non sono applicate e non sono verificati almeno due workspace sullo stesso tenant con un utente limitato tramite gruppo.

## Obiettivo

Il CRM deve adattarsi al tipo di struttura e all'organizzazione del tenant senza duplicare i contatti. Un resort può lavorare con aree Hotel, SPA e Ristorante; una società può usare aree commerciali o per linea di prodotto; un'agenzia può usare pipeline partner dedicate.

## Decisione architetturale

- `contacts` resta la sola anagrafica condivisa nel tenant.
- `crm_workspaces` descrive le aree operative CRM.
- `crm_workspace_contacts` collega lo stesso contatto a uno o più workspace.
- `user_groups` resta l'unico concetto di gruppo/reparto; non viene introdotto un secondo sistema di team CRM.
- `crm_workspace_groups` governa quali gruppi possono leggere/scrivere un workspace.
- `crm_pipelines` e `crm_pipeline_stages` definiscono pipeline specifiche per workspace.
- `crm_workspace_fields` definisce campi operativi specifici senza sporcare l'anagrafica comune.
- `crm_opportunities` contiene le opportunità dei workspace generici.
- Il workspace Hotel predefinito continua a usare `contact_date_requests`: non viene riscritta né duplicata la pipeline alberghiera già collegata a Inbox e calendario domanda.

## Template per tipo tenant

`properties.type` è la fonte esistente per il tipo di tenant (`hotel`, `company`, `agency`). Il configuratore propone modelli coerenti:

- hotel: Hotel predefinito + suggerimenti SPA, Ristorante, Eventi;
- company: Commerciale predefinito + suggerimenti Vendite/Customer Success;
- agency: Agenzia predefinita + workspace Partner;
- qualunque tenant può aggiungere workspace `custom`.

I modelli sono solo un punto di partenza: nome, gruppi, pipeline e campi restano modificabili dal tenant admin.

## Sicurezza e multi-tenancy

- Tutte le nuove entità hanno `property_id` e FK composite che impediscono relazioni cross-tenant.
- RLS verifica tenant e accesso al workspace.
- Tenant admin e superadmin vedono/configurano tutti i workspace del tenant attivo.
- Un operatore vede un workspace se non ha restrizioni di gruppo oppure se appartiene ad almeno un `user_group` autorizzato.
- `can_read` e `can_write` sono verificati sia da RLS sia dalle API server-side.
- Nessun `property_id` inviato dal browser viene usato come autorizzazione.
- Un nuovo contatto viene associato automaticamente al workspace predefinito tramite trigger DB, indipendentemente dalla sorgente che lo crea.

## Compatibilità

La migrazione è additiva. I contatti esistenti vengono associati al workspace predefinito senza essere copiati. Il workspace predefinito è deliberatamente stabile nella prima versione: non può essere archiviato o spostato via UI, così Inbox/PMS/Scout e i flussi esistenti mantengono un riferimento sicuro.

## UI e API

- `/admin/crm/workspaces`: selezione area, pipeline operativa e opportunità.
- `/admin/crm/settings/workspaces`: configurazione tenant di aree, gruppi, fasi e campi.
- `/api/admin/crm/workspaces`: configurazione e membership contatto/workspace.
- `/api/admin/crm/workspace-board`: board operativa e opportunità.
- `lib/crm/workspace-access.ts`: risoluzione autorizzazioni workspace server-side.

## Criteri per Tenant reale

1. Applicare `20260901213000_add_crm_tenant_workspaces.sql` e `20260901213100_harden_crm_workspace_access.sql`.
2. Su un tenant hotel creare almeno SPA e Ristorante da admin.
3. Associare SPA solo al gruppo Spa e Ristorante solo a F&B.
4. Verificare con un utente Spa che Ristorante non sia leggibile né via UI né via API/RLS.
5. Collegare lo stesso contatto a Hotel e SPA e verificare che `contacts.id` resti unico.
6. Creare e spostare un'opportunità SPA nella pipeline configurata.
7. Verificare che la pipeline Hotel continui a leggere le richieste reali da `contact_date_requests`.
8. Verificare mobile, loading, empty state ed error state.

## Rollback

Prima del collaudo reale il rollback applicativo consiste nel rimuovere la voce Aree CRM e non usare le nuove API. Le tabelle sono additive e non modificano i dati business esistenti. La rimozione fisica delle tabelle non è necessaria per il rollback e non deve essere eseguita automaticamente.
