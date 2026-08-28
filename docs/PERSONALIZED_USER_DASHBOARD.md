# Dashboard utente personalizzata — HotelAccelerator

Ultimo aggiornamento: 2026-08-28

## Stato

`Codice` sul branch `feat/tenant-user-dashboard-v2`.

Non promuovere a `Tenant reale` finché la migrazione non è applicata e la pagina non viene collaudata con almeno un amministratore tenant e un collaboratore reale.

## Obiettivo

La home di ogni utente deve essere operativa, non un duplicato del menu. Mostra:

- performance personali misurate e confrontate con obiettivi configurabili;
- conversazioni recenti rispettando l'accesso ai singoli canali;
- attività aperte assegnate all'utente;
- ultime telefonate e chiamate effettivamente da richiamare;
- gli altri pannelli già presenti nel manifest dashboard, se consentiti.

Il design usa i token `--ha-*` già allineati a Santaddeo in `app/globals.css`.

## Visibilità delle card

La fonte autorizzativa resta `lib/platform/dashboard.ts`:

1. ruolo, area e modulo determinano cosa l'utente può vedere;
2. `dashboard_user_settings.hidden_panels` può soltanto nascondere un pannello già consentito;
3. la configurazione dashboard non può concedere permessi, moduli o dati aggiuntivi.

L'amministratore tenant configura utente, obiettivi e card da `/admin/settings/dashboard` tramite `/api/admin/dashboard-settings`.

## Performance e obiettivi

La dashboard riusa `operator_kpi_settings` e `computeOperatorPerformance`.

Non ricostruisce lo storico precedente all'opt-in e non mostra KPI non supportati dai dati. Gli obiettivi ammessi sono:

- risposte negli ultimi 30 giorni;
- conversazioni gestite negli ultimi 30 giorni;
- tempo mediano massimo di risposta, in secondi.

La conversione non è mostrata perché il codice attuale non dispone di una fonte affidabile che attribuisca un esito commerciale all'operatore.

## Telefonate da richiamare

La card usa `phone_calls` tenant-scoped. Una chiamata entrante persa viene indicata come `da richiamare` soltanto se, nel registro successivo disponibile, non esiste una chiamata completata con lo stesso numero. In questo modo una chiamata persa già recuperata non resta artificialmente in allarme.

## Sicurezza e multi-tenancy

- Tutte le query aggiunte filtrano per `property_id` derivato dall'identità server-side.
- Le impostazioni dashboard hanno FK composita `(property_id, user_id)` verso `admin_users`.
- La tabella non è accessibile dai ruoli browser; è usata soltanto da route server tenant-scoped.
- Gli estratti Inbox riusano il filtro dei canali assegnati già usato dall'Inbox principale.
- La home espone solo la performance dell'utente corrente; il confronto fra operatori resta nell'endpoint amministrativo esistente.

## File principali

- `supabase/migrations/20260828143000_add_dashboard_user_settings.sql`
- `lib/platform/dashboard-user-settings.ts`
- `lib/platform/dashboard.ts`
- `app/api/admin/dashboard-settings/route.ts`
- `app/api/platform/dashboard-home/route.ts`
- `app/admin/settings/dashboard/page.tsx`
- `components/admin/dashboard/personalized-dashboard.tsx`
- `app/admin/dashboard/page.tsx`

## Verifiche richieste prima della promozione

- `pnpm run typecheck`
- `pnpm run check:dashboard`
- lint sui file modificati / `pnpm run lint` se il baseline del repository lo consente;
- build Core;
- prova tenant admin: configurazione card e obiettivi di un collaboratore;
- prova collaboratore: nessuna card amministrativa e nessun messaggio di canali non assegnati;
- prova telefono con sequenza persa -> richiamata/completata e persa -> non recuperata;
- viewport mobile e desktop, loading, error e empty state.

## Rollback

Il codice può essere ripristinato tornando alla precedente `app/admin/dashboard/page.tsx`. La nuova tabella è additiva: può restare inutilizzata senza impatto sui flussi precedenti. Se deve essere rimossa, eliminare prima route/UI che la leggono e poi fare una migrazione separata `drop table public.dashboard_user_settings` dopo backup.
