# Dashboard utente personalizzata — HotelAccelerator

Ultimo aggiornamento: 2026-09-05

## Stato

La dashboard personalizzata e gli obiettivi giornata/30 giorni sono a livello `Codice` nel Core. L'estensione KPI commerciali è a livello `Codice` sul branch `feat/operator-sales-goals` finché PR, CI e deploy non sono verificati.

Non promuovere la capability complessiva a `Tenant reale` finché un amministratore tenant non ha eseguito il recupero storico e almeno un collaboratore reale non ha verificato i propri risultati.

## Obiettivo

La home di ogni utente deve essere operativa, non un duplicato del menu. Mostra:

- performance personali misurate e confrontate con obiettivi configurabili;
- risultati commerciali attribuiti con evidenza verificabile;
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

## Performance operative e obiettivi

La dashboard riusa `operator_kpi_settings` e `computeOperatorPerformance`.

Gli obiettivi operativi ammessi sono:

- risposte nella giornata lavorativa;
- conversazioni distinte gestite nella giornata lavorativa;
- risposte negli ultimi 30 giorni;
- conversazioni distinte gestite negli ultimi 30 giorni;
- tempo mediano massimo di risposta, in secondi.

### Significato di “giornata lavorativa”

Per questa capability la giornata è il **giorno di calendario locale della struttura**, dalla mezzanotte alla mezzanotte nel valore `properties.timezone`. Non è una finestra mobile di 24 ore. Il conteggio riparte da zero all'inizio di ogni nuova giornata locale.

Questa scelta mantiene la dashboard indipendente dal modulo HR. Se in futuro si vorranno obiettivi per singolo turno, dovranno essere legati esplicitamente alla sessione di lavoro HR.

### Significato di “ultimi 30 giorni”

I target rappresentano una **finestra mobile di 30 giorni**, non il mese solare. Ogni giorno il periodo si sposta in avanti.

### Tempo mediano di risposta

Il target è una soglia massima: è raggiunto quando il tempo mediano reale è uguale o inferiore al valore configurato. La mediana limita l'effetto di pochi casi eccezionalmente lenti.

## KPI commerciali

La dashboard aggiunge tre superfici individuali:

- **Trattative chiuse vinte / ultimi 30 giorni**;
- **Valore chiuso / budget individuale / ultimi 30 giorni**;
- **Obiettivo extra personalizzabile**, scegliendo una metrica che HotelAccelerator misura realmente: preventivi inviati, chiamate completate, attività completate o tasso di conversione dei preventivi. Il periodo dell'obiettivo extra può essere giornata lavorativa oppure 30 giorni.

Il valore commerciale non viene stimato: se una trattativa è chiusa ma non esiste un importo univoco/confermato, la chiusura conta come numero ma contribuisce `0` al valore fino a verifica amministrativa.

### Fonte e attribuzione

`contact_date_requests.outcome` resta una lettura dell'IA e **non è mai sufficiente** per attribuire una vendita. Le prenotazioni provenienti da Scidoo/MyRestoo o riconosciute come conferme del gestionale restano fuori dai meriti individuali.

Le attribuzioni vivono in `crm_operator_sales_attributions`, un read model separato dalla Inbox. Questo evita di importare i messaggi Gmail con label `SENT` dentro `messages`, comportamento che falserebbe unread e KPI operativi.

Solo righe con `verification_status = 'confirmed'` entrano nei KPI individuali.

Le fonti ammesse sono:

1. **Pipeline umana**: una fase/valore impostati da un operatore hanno autore e timestamp registrati; questa fonte ha precedenza.
2. **Ricostruzione Gmail**: il tenant admin può avviare l'analisi dei thread Gmail collegati alle richieste CRM. Il sistema cerca il preventivo inviato, identifica l'autore da email/display name/firma configurata e cerca un'eventuale accettazione esplicita del cliente successiva al preventivo.
3. **Correzione admin**: un admin può confermare/scartare una proposta, cambiare l'operatore candidato e correggere il valore economico. Una correzione manuale non viene sovrascritta dai successivi scan automatici.

Il corpo completo delle email non viene copiato nel read model: `evidence` conserva solo segnale/match e riferimenti tecnici ai messaggi.

### Regole conservative per lo storico

- Una firma configurata unica o l'email personale esatta possono produrre attribuzione ad alta confidenza.
- Un nome trovato nel corpo senza firma configurata resta `needs_review`.
- Una chiusura retroattiva da Gmail richiede **preventivo identificato + accettazione esplicita del cliente successiva**.
- Cancellazioni, rimborsi, pratiche interne, test e booking confirmation automatiche sono escluse.
- Se un preventivo contiene più importi distinti, nessun importo viene scelto automaticamente.
- Le attribuzioni `needs_review`, `unattributed` o `rejected` non entrano nei KPI.

## Dati e migrazioni

`20260905145308_add_dashboard_workday_goals.sql` aggiunge i target giornalieri.

`20260905151657_add_operator_sales_goals.sql` aggiunge:

- `closed_deals_target`;
- `closed_revenue_target_cents`;
- `custom_goal_metric`, `custom_goal_label`, `custom_goal_target`, `custom_goal_period`;
- `crm_operator_sales_attributions` con FK tenant-aware, confidenza, stato verifica, riferimenti messaggi ed evidenza tecnica minima.

La tabella commerciale è backend-only: RLS attiva, privilegi browser revocati, accesso applicativo tramite route server tenant-scoped.

## Recupero storico

Da `/admin/settings/dashboard`, il tenant admin può usare **Analizza storico commerciale**.

L'operazione è batch, idempotente e rieseguibile. Ogni batch legge direttamente Gmail tramite il connettore già associato alla conversazione; non crea messaggi Inbox e non possiede cron/webhook separati. Le proposte dubbie vengono mostrate nella coda **Attribuzioni da verificare**.

Lo storico oggi disponibile è parziale per definizione: soltanto le richieste CRM con `gmail_thread_id` e `channel_id` possono essere ricostruite da Gmail. Le decisioni umane già registrate in pipeline possono invece essere attribuite anche senza Gmail.

## Telefonate da richiamare

La card usa `phone_calls` tenant-scoped. Una chiamata entrante persa viene indicata `da richiamare` soltanto se, nel registro successivo disponibile, non esiste una chiamata completata con lo stesso numero.

## Sicurezza e multi-tenancy

- Tutte le query filtrano per `property_id` derivato dall'identità server-side.
- Le impostazioni dashboard hanno FK composita `(property_id, user_id)` verso `admin_users`.
- `crm_operator_sales_attributions` usa riferimenti tenant-aware verso richiesta, conversazione e operatore.
- Le tabelle di configurazione/attribuzione non sono accessibili dai ruoli browser.
- Il backfill storico è disponibile soltanto al tenant admin.
- La home espone solo le performance dell'utente corrente; il confronto fra operatori resta amministrativo.
- Il fuso orario viene letto dalla property server-side.

## File principali

- `supabase/migrations/20260828143000_add_dashboard_user_settings.sql`
- `supabase/migrations/20260905145308_add_dashboard_workday_goals.sql`
- `supabase/migrations/20260905151657_add_operator_sales_goals.sql`
- `lib/platform/dashboard-user-settings.ts`
- `lib/platform/local-day.ts`
- `lib/platform/operator-sales-performance.ts`
- `lib/crm/sales-attribution.ts`
- `lib/crm/sales-attribution-store.ts`
- `app/api/admin/dashboard-settings/route.ts`
- `app/api/admin/crm/sales-attribution/route.ts`
- `app/api/admin/crm/pipeline/route.ts`
- `app/api/platform/dashboard-home/route.ts`
- `app/admin/settings/dashboard/page.tsx`
- `components/admin/dashboard/personalized-dashboard.tsx`
- `components/admin/dashboard/commercial-performance.tsx`
- `components/admin/dashboard/sales-attribution-admin.tsx`
- `tests/dashboard-local-day.test.ts`
- `tests/dashboard-commercial-goals.test.ts`
- `tests/sales-attribution.test.ts`

## Verifiche richieste prima della promozione

- `pnpm run typecheck`;
- test dashboard local day, commercial goals e sales attribution;
- `pnpm run check:dashboard`;
- build Core / preview Vercel;
- test tenant admin su configurazione budget e obiettivo extra;
- esecuzione backfill su un tenant reale e verifica manuale di almeno una attribuzione forte e una `needs_review`;
- test collaboratore: vede solo i propri risultati;
- test riapertura/persa dopo confermata: la chiusura deve uscire dal KPI mantenendo lo storico del preventivo;
- test mobile, loading, error ed empty state.

## Rollback

Il codice può smettere di leggere i nuovi campi/attribution table senza modificare i dati esistenti. Le colonne sono additive. Un eventuale `drop` deve avvenire solo con migrazione separata dopo rollback applicativo e conservazione dell'audit commerciale.
