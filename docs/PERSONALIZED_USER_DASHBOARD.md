# Dashboard utente personalizzata — HotelAccelerator

Ultimo aggiornamento: 2026-09-05

## Stato

La dashboard personalizzata, gli obiettivi giornata/30 giorni e i KPI commerciali sono a livello `Codice` nel Core una volta integrata la PR #390.

Non promuovere la capability complessiva a `Tenant reale` finche un amministratore tenant non ha eseguito il recupero storico e almeno un collaboratore reale non ha verificato i propri risultati.

## Obiettivo

La home di ogni utente deve essere operativa, non un duplicato del menu. Mostra:

- performance operative personali misurate e confrontate con obiettivi configurabili;
- risultati commerciali attribuiti con evidenza verificabile;
- conversazioni recenti rispettando l'accesso ai singoli canali;
- attivita aperte assegnate all'utente;
- ultime telefonate e chiamate effettivamente da richiamare;
- gli altri pannelli gia presenti nel manifest dashboard, se consentiti.

Il design usa i token `--ha-*` gia allineati a Santaddeo in `app/globals.css`.

## Visibilita delle card

La fonte autorizzativa resta `lib/platform/dashboard.ts`:

1. ruolo, area e modulo determinano cosa l'utente puo vedere;
2. `dashboard_user_settings.hidden_panels` puo soltanto nascondere un pannello gia consentito;
3. la configurazione dashboard non puo concedere permessi, moduli o dati aggiuntivi.

`my-performance` e una card operativa legata a Inbox. `my-commercial-performance` e una card distinta e richiede area `crm`: avere accesso alla sola Inbox non espone vendite, budget o risultati commerciali.

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

Per questa capability la giornata e il **giorno di calendario locale della struttura**, dalla mezzanotte alla mezzanotte nel valore `properties.timezone`. Non e una finestra mobile di 24 ore. Il conteggio riparte da zero all'inizio di ogni nuova giornata locale.

Questa scelta mantiene la dashboard indipendente dal modulo HR. Se in futuro si vorranno obiettivi per singolo turno, dovranno essere legati esplicitamente alla sessione di lavoro HR.

### Significato di “ultimi 30 giorni”

I target rappresentano una **finestra mobile di 30 giorni**, non il mese solare. Ogni giorno il periodo si sposta in avanti.

### Tempo mediano di risposta

Il target e una soglia massima: e raggiunto quando il tempo mediano reale e uguale o inferiore al valore configurato. La mediana limita l'effetto di pochi casi eccezionalmente lenti.

## KPI commerciali

La dashboard aggiunge tre superfici individuali:

- **Trattative chiuse vinte / ultimi 30 giorni**;
- **Valore chiuso / budget individuale / ultimi 30 giorni**;
- **Obiettivo extra personalizzabile**, scegliendo una metrica che HotelAccelerator misura realmente: preventivi inviati, chiamate completate, attivita completate o tasso di conversione dei preventivi. Il periodo dell'obiettivo extra puo essere giornata lavorativa oppure 30 giorni.

Il valore commerciale non viene stimato. Se una trattativa e chiusa ma non esiste un importo univoco/confermato, la chiusura conta come numero ma il totale economico e l'avanzamento budget sono dichiarati **parziali** finche il valore non viene verificato.

### Fonte e attribuzione

`contact_date_requests.outcome` resta una lettura dell'IA e **non e mai sufficiente** per attribuire una vendita. Le prenotazioni provenienti da Scidoo/MyRestoo o riconosciute come conferme del gestionale restano fuori dai meriti individuali.

Le attribuzioni vivono in `crm_operator_sales_attributions`, un read model separato dalla Inbox. Questo evita di importare i messaggi Gmail con label `SENT` dentro `messages`, comportamento che falserebbe unread e KPI operativi.

Solo righe con `verification_status = 'confirmed'` entrano nei KPI individuali.

### Esito e merito sono separati

La fase umana finale (`confermata`/`persa`) e le conferme/cancellazioni esplicite del cliente determinano lo stato della trattativa secondo il segnale finale piu recente. Chi cambia la fase non riceve automaticamente il merito commerciale.

Per attribuire l'operatore il sistema cerca soprattutto l'autore del preventivo: email personale, firma configurata, display name e, come segnale debole, nome nel corpo. Se Maria invia il preventivo e Luca marca poi `Confermata`, il merito resta a Maria. Se non e possibile identificare chi ha scritto, Luca puo comparire soltanto come candidato `needs_review`.

La fase `preventivo_inviato` impostata direttamente da un operatore e una prova esplicita per i flussi futuri. Inserire soltanto l'importo non prova chi abbia scritto il preventivo.

Una cancellazione/rimborso successivi rimuovono la pratica dalle vendite chiuse ma non cancellano lo storico del preventivo.

### Recupero Gmail

Il tenant admin puo avviare l'analisi dei thread Gmail collegati alle richieste CRM. Il sistema cerca il preventivo inviato, identifica l'autore e cerca una successiva accettazione o cancellazione esplicita del cliente.

Una firma configurata unica o l'email personale esatta possono produrre attribuzione ad alta confidenza; segnali piu deboli restano `needs_review`. Se un preventivo contiene piu importi distinti, nessun importo viene scelto automaticamente.

Una correzione admin di operatore/valore/stato non viene sovrascritta dai successivi scan automatici.

Il corpo completo delle email non viene copiato nel read model: `evidence` conserva soltanto segnale/match e riferimenti tecnici ai messaggi.

## Dati e migrazioni

`20260905145308_add_dashboard_workday_goals.sql` aggiunge i target giornalieri.

`20260905151657_add_operator_sales_goals.sql` aggiunge:

- `closed_deals_target`;
- `closed_revenue_target_cents`;
- `custom_goal_metric`, `custom_goal_label`, `custom_goal_target`, `custom_goal_period`;
- `crm_operator_sales_attributions` con FK tenant-aware, confidenza, stato verifica, riferimenti messaggi ed evidenza tecnica minima.

`20260905153313_audit_operator_sales_attribution.sql` aggiunge l'audit append-only delle variazioni materiali di attribuzione, con trigger `SECURITY INVOKER` e privilegi di modifica revocati alla tabella audit.

Le tabelle commerciali sono backend-only: RLS attiva, privilegi browser revocati, accesso applicativo tramite route server tenant-scoped.

## Recupero storico

Da `/admin/settings/dashboard`, il tenant admin puo usare **Analizza storico commerciale**.

L'operazione e batch, idempotente e rieseguibile. Ogni batch legge direttamente Gmail tramite il connettore gia associato alla conversazione; non crea messaggi Inbox e non possiede cron/webhook separati. Le proposte dubbie vengono mostrate nella coda **Attribuzioni da verificare**.

La copertura retroattiva attuale e volutamente limitata alle richieste CRM esistenti. I thread Gmail collegati possono essere analizzati; una decisione umana gia registrata in pipeline puo generare un candidato anche senza Gmail. Trattative completamente assenti dal CRM non vengono inventate né scoperte con una scansione indiscriminata di tutta la Posta inviata.

## Obiettivo extra e permessi

L'admin puo configurare:

- preventivi inviati;
- chiamate completate;
- attivita completate;
- tasso di conversione dei preventivi.

La dashboard calcola la metrica soltanto se l'utente possiede l'area necessaria. Ad esempio una metrica “chiamate completate” richiede l'area `calls`; altrimenti la UI mostra che la metrica non e disponibile con i permessi correnti invece di esporre dati fuori autorizzazione.

## Telefonate da richiamare

La card usa `phone_calls` tenant-scoped. Una chiamata entrante persa viene indicata `da richiamare` soltanto se, nel registro successivo disponibile, non esiste una chiamata completata con lo stesso numero.

## Sicurezza e multi-tenancy

- Tutte le query filtrano per `property_id` derivato dall'identita server-side.
- Le impostazioni dashboard hanno FK composita `(property_id, user_id)` verso `admin_users`.
- `crm_operator_sales_attributions` usa riferimenti tenant-aware verso richiesta, conversazione e operatore.
- Le tabelle di configurazione/attribuzione/audit non sono accessibili dai ruoli browser.
- Il backfill storico e disponibile soltanto al tenant admin.
- La home espone solo le performance dell'utente corrente.
- I risultati commerciali richiedono area CRM; chiamate/task extra rispettano le rispettive aree.
- Il fuso orario viene letto dalla property server-side.

## File principali

- `supabase/migrations/20260828143000_add_dashboard_user_settings.sql`
- `supabase/migrations/20260905145308_add_dashboard_workday_goals.sql`
- `supabase/migrations/20260905151657_add_operator_sales_goals.sql`
- `supabase/migrations/20260905153313_audit_operator_sales_attribution.sql`
- `lib/platform/dashboard-user-settings.ts`
- `lib/platform/dashboard.ts`
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
- test collaboratore: vede solo i propri risultati e non vede la card commerciale senza area CRM;
- test “autore preventivo diverso da chi chiude”: il merito resta all'autore;
- test confermata -> cancellata/persa: la chiusura esce dal KPI mantenendo lo storico del preventivo;
- test importo ambiguo: nessun valore economico inventato;
- test mobile, loading, error ed empty state.

## Rollback

Il codice puo smettere di leggere i nuovi campi/read model senza modificare i dati esistenti. Le colonne sono additive. Un eventuale `drop` deve avvenire solo con migrazione separata dopo rollback applicativo e conservazione dell'audit commerciale.
