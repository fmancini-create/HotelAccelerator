# HR — timbratura al login: gate mobile e promemoria desktop

Stato ufficiale della capability: **Codice**. Il gate mobile e' online dalla PR #381; il promemoria desktop viene sviluppato sul branch `feat/hr-desktop-timeclock-prompt`. Non promuovere a `Tenant reale` prima del collaudo autenticato con almeno un dipendente reale.

## Obiettivo

Per i dipendenti ai quali il tenant assegna l'obbligo di timbratura (`hr_employees.requires_time_clock=true`), il login HotelAccelerator deve ricordare la presenza senza rendere il desktop inutilizzabile:

- **smartphone**: resta il gate obbligatorio verso la schermata di timbratura prima della dashboard;
- **desktop senza check-in aperto**: la dashboard si apre e mostra la domanda “Devi timbrare l'ingresso?”;
- **desktop con check-in aperto**: la dashboard si apre normalmente senza promemoria;
- **utente senza obbligo individuale**: nessun gate e nessun promemoria.

## Configurazione

`hr_employees.requires_time_clock` e' il flag autorevole per il singolo dipendente. Il valore predefinito e' `false`.

La pagina HR amministrativa espone la configurazione per dipendente. L'obbligo puo' essere attivato soltanto se la scheda HR e' collegata a un account `admin_users` dello stesso tenant; in caso contrario l'API rifiuta la configurazione.

Non vengono aggiunte nuove tabelle, variabili ambiente, cron o webhook per il promemoria desktop.

## Flusso post-login

1. l'autenticazione resta quella unificata HotelAccelerator;
2. per un account tenant viene verificato se il client e' mobile;
3. il gate controlla modulo HR `active`/`trial` non scaduto, dipendente attivo e `requires_time_clock=true`;
4. su mobile la destinazione resta `/admin/time-clock`;
5. su desktop, soltanto per chi ha l'obbligo, viene cercata una `hr_time_entries` dello stesso `property_id` e `employee_id` con `clock_out_at is null`;
6. se esiste una presenza aperta, la destinazione e' `/admin/dashboard` senza messaggi;
7. se non esiste, la destinazione e' `/admin/dashboard?time_clock_prompt=1`;
8. la dashboard mostra un `AlertDialog` con le azioni `Timbra ora` e `No, continua`;
9. `Timbra ora` apre `/admin/time-clock`, che usa l'API HR e il geofence gia' esistenti;
10. `No, continua` rimuove il marker dalla URL e lascia l'utente nella dashboard.

Password login, sessione gia' autenticata e callback Google OAuth usano lo stesso `authorizeUser`. I superadmin puri non vengono coinvolti.

## Affidabilita e sicurezza

- Il tenant non viene accettato dal browser: le letture restano derivate dall'identita autenticata.
- La ricerca della presenza aperta e' filtrata esplicitamente per `property_id` e `employee_id`; RLS mantiene inoltre il confine tenant.
- Un errore di lettura del modulo HR, del dipendente o della presenza aperta non blocca l'accesso: il login fallisce aperto verso la dashboard e registra l'errore disponibile.
- Il marker `time_clock_prompt=1` e' solo una decisione UI; non concede permessi. La vera timbratura resta autorizzata e validata da `/api/hr/time-clock`.
- La posizione continua a essere acquisita soltanto quando l'utente decide di timbrare.
- Il desktop e' intenzionalmente non bloccante; il mobile mantiene il gate vincolante richiesto.

## Migrazione e rollback

La capability usa la migrazione gia' esistente `20260905140456_add_hr_employee_time_clock_requirement.sql`. Il promemoria desktop non richiede schema nuovo.

Rollback applicativo del promemoria: rimuovere la destinazione con `time_clock_prompt=1` e il componente `DesktopTimeClockPrompt`. Il gate mobile e il flag `requires_time_clock` possono restare invariati.

## Gate per il collaudo reale

Prima di promuovere la capability a `Tenant reale` verificare:

- dipendente con obbligo, smartphone: login -> timbratura -> GPS/geofence -> conferma -> dashboard;
- dipendente con obbligo, desktop senza entrata aperta: login -> dashboard + domanda -> `Timbra ora` -> timbratura;
- stesso caso desktop scegliendo `No, continua`: resta in dashboard e il dialog non ricompare nella stessa URL;
- dipendente con obbligo e check-in gia' aperto: login desktop -> dashboard senza domanda;
- dipendente senza obbligo: login mobile/desktop -> comportamento standard;
- fuori geofence con policy di blocco e con policy `needs_review`;
- permesso GPS negato e successivo retry;
- isolamento: nessuna lettura o configurazione puo' attraversare il tenant;
- Google OAuth e login password producono la stessa decisione a parita' di dispositivo/stato presenza.
