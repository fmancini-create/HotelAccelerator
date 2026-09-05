# Dashboard utente personalizzata — HotelAccelerator

Ultimo aggiornamento: 2026-09-05

## Stato

`Codice` nel Core per la dashboard personalizzata. L'estensione degli obiettivi per giornata lavorativa e 30 giorni è in sviluppo sul branch `feat/dashboard-workday-goals`.

Non promuovere la capability complessiva a `Tenant reale` finché la pagina non viene collaudata con almeno un amministratore tenant e un collaboratore reale. La migrazione additiva degli obiettivi giornalieri è applicata al database HotelAccelerator, ma questo non equivale a deploy dell'interfaccia.

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

- risposte nella giornata lavorativa;
- conversazioni distinte gestite nella giornata lavorativa;
- risposte negli ultimi 30 giorni;
- conversazioni distinte gestite negli ultimi 30 giorni;
- tempo mediano massimo di risposta, in secondi.

### Significato di “giornata lavorativa”

Per questa capability la giornata è il **giorno di calendario locale della struttura**, dalla mezzanotte alla mezzanotte nel valore `properties.timezone`. Non è una finestra mobile di 24 ore. Il conteggio riparte quindi da zero all'inizio di ogni nuova giornata locale.

Questa scelta mantiene la dashboard indipendente dal modulo HR: un turno notturno o un turno che attraversa la mezzanotte resta un concetto HR separato. Se in futuro si vorranno obiettivi per singolo turno, dovranno essere legati esplicitamente alla sessione di lavoro HR invece di cambiare silenziosamente il significato di questi campi.

### Significato di “ultimi 30 giorni”

I target esistenti restano retrocompatibili e rappresentano una **finestra mobile di 30 giorni**, non il mese solare. Ogni giorno il periodo si sposta in avanti.

### Tempo mediano di risposta

Il target è una soglia massima: è raggiunto quando il tempo mediano reale è uguale o inferiore al valore configurato. La mediana viene mantenuta perché limita l'effetto di pochi casi eccezionalmente lenti. L'interfaccia chiarisce anche la conversione pratica, per esempio `600 secondi = 10 minuti`.

La conversione commerciale non è mostrata perché il codice attuale non dispone di una fonte affidabile che attribuisca un esito commerciale all'operatore.

## Dati e migrazione

La migrazione `20260905145308_add_dashboard_workday_goals.sql` aggiunge soltanto due colonne nullable a `dashboard_user_settings`:

- `workday_responses_target`;
- `workday_conversations_target`.

I campi precedenti `responses_target` e `conversations_target` restano invariati e continuano a rappresentare i target sugli ultimi 30 giorni. Non viene eseguito alcun backfill o ricalcolo dei valori esistenti.

## Telefonate da richiamare

La card usa `phone_calls` tenant-scoped. Una chiamata entrante persa viene indicata come `da richiamare` soltanto se, nel registro successivo disponibile, non esiste una chiamata completata con lo stesso numero. In questo modo una chiamata persa già recuperata non resta artificialmente in allarme.

## Sicurezza e multi-tenancy

- Tutte le query aggiunte filtrano per `property_id` derivato dall'identità server-side.
- Le impostazioni dashboard hanno FK composita `(property_id, user_id)` verso `admin_users`.
- La tabella non è accessibile dai ruoli browser; è usata soltanto da route server tenant-scoped.
- Gli estratti Inbox riusano il filtro dei canali assegnati già usato dall'Inbox principale.
- La home espone solo la performance dell'utente corrente; il confronto fra operatori resta nell'endpoint amministrativo esistente.
- Il fuso orario viene letto dalla `property` già risolta server-side e non viene accettato dal browser come criterio autorizzativo.

## File principali

- `supabase/migrations/20260828143000_add_dashboard_user_settings.sql`
- `supabase/migrations/20260905145308_add_dashboard_workday_goals.sql`
- `lib/platform/dashboard-user-settings.ts`
- `lib/platform/local-day.ts`
- `lib/platform/dashboard.ts`
- `app/api/admin/dashboard-settings/route.ts`
- `app/api/platform/dashboard-home/route.ts`
- `app/admin/settings/dashboard/page.tsx`
- `components/admin/dashboard/personalized-dashboard.tsx`
- `tests/dashboard-local-day.test.ts`
- `app/admin/dashboard/page.tsx`

## Verifiche richieste prima della promozione

- `pnpm run typecheck`;
- `pnpm vitest run tests/dashboard-local-day.test.ts`;
- `pnpm run check:dashboard`;
- lint sui file modificati / `pnpm run lint` se il baseline del repository lo consente;
- build Core;
- prova tenant admin: configurazione separata target giornata e target 30 giorni;
- prova collaboratore: visualizzazione “Oggi” e “Ultimi 30 giorni” con i propri soli KPI;
- prova cambio fuso/DST e reset alla mezzanotte locale;
- prova collaboratore: nessuna card amministrativa e nessun messaggio di canali non assegnati;
- prova telefono con sequenza persa -> richiamata/completata e persa -> non recuperata;
- viewport mobile e desktop, loading, error e empty state.

## Rollback

L'estensione applicativa può essere ripristinata ignorando i due nuovi campi giornalieri. Le colonne sono nullable e additive, quindi possono restare nel database senza impatto sul comportamento precedente. Un eventuale `drop column` va fatto solo in una migrazione separata dopo rollback del codice e verifica che nessun dato giornaliero debba essere conservato.
