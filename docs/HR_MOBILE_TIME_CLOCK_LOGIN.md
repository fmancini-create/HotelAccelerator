# HR — timbratura al login: gate mobile e promemoria desktop

Stato ufficiale della capability: **Codice**. Il gate mobile e' stato introdotto con la PR #381; il promemoria desktop e' tracciato dalla PR #383 (`feat/hr-desktop-timeclock-prompt`). Non promuovere a `Tenant reale` prima del collaudo autenticato con almeno un dipendente reale.

## Obiettivo

Per i dipendenti ai quali il tenant assegna l'obbligo di timbratura (`hr_employees.requires_time_clock=true`), il login HotelAccelerator deve ricordare la presenza senza rendere il desktop inutilizzabile:

- **smartphone**: resta il gate obbligatorio verso la schermata di timbratura prima della dashboard;
- **desktop senza check-in aperto**: la dashboard si apre e mostra la domanda “Devi timbrare l'ingresso?”;
- **desktop con check-in aperto**: la dashboard si apre normalmente senza promemoria;
- **utente senza obbligo individuale**: nessun gate e nessun promemoria.

## Configurazione

`hr_employees.requires_time_clock` e' il flag autorevole per il singolo dipendente. Il valore predefinito e' `false`.

Quando il modulo HR e' effettivamente attivo (`active` oppure `trial` non scaduto), ogni account `admin_users` del tenant deve avere una scheda `hr_employees` collegata tramite `admin_user_id`. Questo rende coerenti Utenti, HR e il gate di timbratura anche per account creati dopo l'attivazione del modulo o attivati dalla directory Suite.

La sincronizzazione non elimina i dipendenti HR privi di login. Se un dipendente era stato inserito manualmente prima di creare l'account HotelAccelerator, il sistema collega automaticamente soltanto un match email univoco nello stesso tenant; in caso ambiguo non indovina l'identita'. Per una scheda gia collegata aggiorna solo nome/email e conserva stato lavorativo, reparto, turni, documenti e `requires_time_clock`.

La pagina HR amministrativa espone quindi la configurazione per tutti gli account tenant collegati e continua a mostrare separatamente eventuali dipendenti senza account. L'obbligo puo' essere applicato solo a una scheda collegata a un account `admin_users` dello stesso tenant.

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
- Il provisioning account -> dipendente filtra sempre per `property_id`; un match email viene usato solo se unico nello stesso tenant.
- Le funzioni di sincronizzazione HR sono `SECURITY DEFINER` con `search_path` fissato e `EXECUTE` revocato a `public`, `anon` e `authenticated`; vengono usate dai trigger database, non come RPC pubbliche.
- Un errore di lettura del modulo HR, del dipendente o della presenza aperta non blocca l'accesso: il login fallisce aperto verso la dashboard e registra l'errore disponibile.
- Il marker `time_clock_prompt=1` e' solo una decisione UI; non concede permessi. La vera timbratura resta autorizzata e validata da `/api/hr/time-clock`.
- La posizione continua a essere acquisita soltanto quando l'utente decide di timbrare.
- Il desktop e' intenzionalmente non bloccante; il mobile mantiene il gate vincolante richiesto.

## Migrazioni e rollback

- `20260905140456_add_hr_employee_time_clock_requirement.sql`: introduce il flag individuale `requires_time_clock`.
- `20260905162733_sync_hr_users_with_tenant_accounts.sql`: sincronizza tutti gli account tenant con le anagrafiche HR, collega un match email univoco preesistente e fa il backfill dei tenant HR gia attivi.

Rollback applicativo del promemoria: rimuovere la destinazione con `time_clock_prompt=1` e il componente `DesktopTimeClockPrompt`. Il gate mobile e il flag `requires_time_clock` possono restare invariati.

Rollback della sincronizzazione account -> HR: ripristinare le funzioni/trigger della migration precedente. I record `hr_employees` creati dal backfill non vanno cancellati in modo globale: prima occorre verificare che non abbiano gia ricevuto turni, documenti, timbrature o altre relazioni HR.

## Gate per il collaudo reale

Prima di promuovere la capability a `Tenant reale` verificare:

- tutti gli utenti HotelAccelerator del tenant compaiono nella gestione HR dopo l'attivazione del modulo;
- creazione di un nuovo utente tenant con HR attivo -> nuova scheda HR collegata senza intervento manuale;
- dipendente preesistente con email univoca -> collegamento allo stesso record senza duplicato;
- dipendente con obbligo, smartphone: login -> timbratura -> GPS/geofence -> conferma -> dashboard;
- dipendente con obbligo, desktop senza entrata aperta: login -> dashboard + domanda -> `Timbra ora` -> timbratura;
- stesso caso desktop scegliendo `No, continua`: resta in dashboard e il dialog non ricompare nella stessa URL;
- dipendente con obbligo e check-in gia' aperto: login desktop -> dashboard senza domanda;
- dipendente senza obbligo: login mobile/desktop -> comportamento standard;
- fuori geofence con policy di blocco e con policy `needs_review`;
- permesso GPS negato e successivo retry;
- isolamento: nessuna lettura o configurazione puo' attraversare il tenant;
- Google OAuth e login password producono la stessa decisione a parita' di dispositivo/stato presenza.
