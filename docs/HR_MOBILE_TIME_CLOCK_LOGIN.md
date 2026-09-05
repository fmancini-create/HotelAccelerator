# HR — gate mobile di timbratura al login

Stato ufficiale del deliverable: **Codice** sul branch `feat/hr-mobile-timeclock-login-gate`. Non promuovere a `Tenant reale` prima del collaudo autenticato su smartphone con almeno un dipendente reale.

## Obiettivo

Per i dipendenti ai quali il tenant assegna l'obbligo di timbratura, il login HotelAccelerator da smartphone deve aprire la schermata di presenza prima della dashboard. Il redirect alla dashboard avviene soltanto dopo una risposta positiva dell'API di timbratura.

Il desktop resta invariato. Anche gli utenti HR senza obbligo individuale continuano ad atterrare normalmente sulla dashboard.

## Configurazione

`hr_employees.requires_time_clock` e' il flag autorevole per il singolo dipendente. Il valore predefinito e' `false`, quindi la migrazione non modifica il comportamento degli utenti esistenti.

La pagina HR amministrativa espone la configurazione per dipendente. L'obbligo puo' essere attivato soltanto se la scheda HR e' collegata a un account `admin_users` dello stesso tenant; in caso contrario l'API rifiuta la configurazione.

## Flusso post-login

1. l'autenticazione resta quella unificata HotelAccelerator;
2. per un account tenant viene verificato se il client e' mobile;
3. il gate controlla modulo HR `active`/`trial` non scaduto, dipendente attivo e `requires_time_clock=true`;
4. se tutte le condizioni sono vere, la destinazione diventa `/admin/time-clock`;
5. la schermata legge lo stato corrente da `/api/hr/time-clock` e propone entrata oppure uscita;
6. geolocalizzazione e geofence usano la stessa API HR gia' esistente;
7. solo dopo una `POST /api/hr/time-clock` riuscita il browser viene reindirizzato a `/admin/dashboard`.

Password login, sessione gia' autenticata e callback Google OAuth usano lo stesso gate. I superadmin puri non vengono coinvolti.

## Affidabilita e sicurezza

- Il tenant non viene accettato dal browser: le route HR continuano a derivarlo dall'identita autenticata.
- Le letture del gate sono limitate alla property e all'account autenticato.
- Un errore di lettura del modulo HR non blocca l'accesso generale alla piattaforma: il login fallisce aperto verso la dashboard e registra l'errore server/client disponibile.
- La modifica dell'obbligo richiede un tenant admin ed e' registrata in `hr_audit_log`.
- La posizione continua a essere acquisita soltanto quando l'utente preme il pulsante di timbratura.

## Migrazione e rollback

Migrazione: `20260905140456_add_hr_employee_time_clock_requirement.sql`.

Rollback applicativo: disattivare i flag `requires_time_clock` per i dipendenti interessati oppure rimuovere il gate dal routing. La colonna puo' restare nel database senza alterare i flussi esistenti grazie al default `false`; eliminarla e' necessario solo per rollback schema esplicito.

## Gate per il collaudo reale

Prima di promuovere il deliverable a `Tenant reale` verificare su smartphone:

- dipendente con obbligo: login -> timbratura -> GPS/geofence -> conferma -> dashboard;
- dipendente senza obbligo: login -> dashboard;
- stesso dipendente obbligato da desktop: login -> dashboard;
- fuori geofence con policy di blocco e con policy `needs_review`;
- permesso GPS negato e successivo retry;
- isolamento: un admin del tenant A non puo' modificare il flag di un dipendente del tenant B;
- Google OAuth e login password producono la stessa destinazione.
