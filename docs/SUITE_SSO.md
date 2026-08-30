# Suite SSO — HotelAccelerator e prodotti satellite

Ultimo aggiornamento: 2026-08-30

## Stato

**Codice**. Il contratto di ingresso HotelAccelerator → satellite esiste gia'. Questa modifica aggiunge il rientro satellite → HotelAccelerator e la propagazione della policy di inattivita' per ManuBot. Prima di promuovere lo stato servono build verdi e una prova reale con utente/tenant collegato.

## Principio

HotelAccelerator resta il proprietario dell'identita' di suite, del tenant Core e degli entitlement. I satelliti mantengono la propria sessione e il proprio database: non condividono cookie Supabase, refresh token, service role o access token con il Core.

Il passaggio fra prodotti usa codici casuali monouso, a vita breve, salvati nel Core solo come hash. Il prodotto satellite si autentica server-to-server con Vercel OIDC del proprio progetto; la chiave statica per prodotto resta esclusivamente fallback di recovery/sviluppo.

## Ingresso Core → satellite

1. Un utente autenticato nel Core chiama `/api/platform/suite-launch?product=...`.
2. Il Core verifica tenant attivo, modulo abilitato e mapping `suite_tenant_links`.
3. Il Core crea un codice monouso con scadenza breve in `suite_sso_exchange_codes`.
4. Il browser viene inviato a `/auth/hotelaccelerator` del satellite.
5. Il satellite scambia il codice tramite `/api/integrations/suite-sso/v1/exchange` e crea la propria sessione locale.

## Rientro satellite → Core

Il pulsante di ritorno non deve mai essere un semplice link a `/admin/dashboard`, perche' la sessione Core puo' essere scaduta mentre l'utente sta lavorando nel satellite.

1. Il satellite conserva in `app_metadata` server-only l'`sourceUserId` originario e gli identificativi tenant ricevuti dal Core.
2. La route locale di rientro verifica sessione satellite, utente attivo e company corrente.
3. Il server satellite chiama `/api/integrations/suite-sso/v1/return` autenticandosi come progetto.
4. Il Core non si fida del tenant dichiarato: ricostruisce `property_id` da `suite_tenant_links`, verifica modulo attivo, utente auth e appartenenza/ruolo.
5. Il Core emette un nuovo codice monouso con TTL 90 secondi.
6. Il browser apre `/auth/suite-return`, che consuma atomicamente il codice e ripete i controlli di revoca.
7. Solo dopo i controlli il Core crea la propria sessione Supabase con un token magic-link monouso generato server-side e porta l'utente a `/admin/dashboard`.
8. Per un superadmin viene ripristinato esplicitamente il tenant del mapping tramite `ha_active_property_id`.

## Inattivita' di suite

Un satellite senza timeout non deve poter aggirare la disconnessione impostata nel Core.

`/api/integrations/suite-sso/v1/policy` risolve la stessa policy di HotelAccelerator per l'utente originario:

- override dell'utente;
- in assenza di override, tempo piu' breve fra i gruppi;
- policy di piattaforma per il superadmin;
- nessun timeout quando il Core non ne ha configurato uno.

ManuBot interroga questa policy server-to-server e la applica alle sole sessioni nate da HotelAccelerator. Gli account ManuBot standalone non cambiano comportamento. La policy viene riletta periodicamente; un errore temporaneo di rete non forza il logout di un operatore attivo.

## Sicurezza e tenant isolation

- Nessun `property_id` ricevuto dal browser autorizza il rientro.
- Il satellite invia il proprio `externalTenantId`; il Core deriva la property dal mapping autorevole.
- Il `sourceUserId` viene verificato contro Supabase Auth del Core e contro `admin_users`/`platform_collaborators`.
- L'entitlement del modulo viene verificato sia all'emissione sia al consumo del codice.
- I codici sono casuali, salvati come SHA-256, monouso e scadono dopo 90 secondi.
- I metadati di origine in ManuBot sono `app_metadata`, quindi non modificabili dal browser con le normali API utente.
- Nessun segreto viene esposto al browser.

## Compatibilita' e rollout

Non sono richieste migrazioni: il rientro riusa `suite_sso_exchange_codes` e i mapping esistenti. Una sessione ManuBot creata prima del rilascio non possiede ancora i nuovi `app_metadata`; per abilitarne il rientro SSO deve essere effettuato almeno un nuovo ingresso HotelAccelerator → ManuBot dopo il deploy.

## Rollback

Il rollback e' applicativo: rimuovere/disabilitare le route di rientro e riportare il pulsante a un accesso esplicito al Core. Nessun dato cliente o schema deve essere ripristinato. I codici non consumati scadono autonomamente.

## Verifiche obbligatorie prima di `Tenant reale`

- build/typecheck dei due repository;
- launch HotelAccelerator → ManuBot con tenant reale;
- attivita' in ManuBot oltre il timeout della scheda Core e rientro senza nuovo login;
- logout per inattivita' in ManuBot secondo policy Core;
- rifiuto con modulo revocato, utente disattivato, company diversa o codice gia' consumato;
- verifica superadmin con tenant selezionato;
- verifica che un account ManuBot standalone resti invariato.
