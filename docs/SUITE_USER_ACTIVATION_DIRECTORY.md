# Directory utenti suite e attivazione selettiva

Stato ufficiale durante il rollout: **Codice**. Non promuovere a `Tenant reale` o `Multi-tenant` senza prova autenticata su tenant reali e test esplicito di isolamento.

## Obiettivo

Un tenant HotelAccelerator che possiede anche Santaddeo, HotelProfitAI o ManuBot deve poter vedere gli utenti gia presenti in quei prodotti e scegliere quali abilitare anche in HotelAccelerator.

Gli utenti **non vengono copiati automaticamente**. Nella pagina `/admin/users` HotelAccelerator mostra una sezione "Utenti disponibili dalla suite 4BID" con un pulsante `Attiva` per ogni persona disponibile.

## Regole

- Il tenant browser non sceglie ne invia un tenant satellite.
- HotelAccelerator ricava il `customer_account` dalla property attiva e poi i `suite_tenant_links` dello stesso account.
- Solo prodotti con entitlement `active` o `trial` e non scaduto vengono interrogati.
- Il Core interroga i satelliti server-to-server usando una credenziale interna per prodotto; gli endpoint satellite accettano anche OIDC del progetto HotelAccelerator production.
- Ogni satellite ricontrolla il tenant ricevuto e legge solo membership di quel tenant.
- Vengono restituiti soltanto ID locale, email, nome e ruolo sorgente; nessuna password o autorizzazione di dominio viene esportata.
- La stessa email presente in piu prodotti dello stesso account viene mostrata una volta con piu badge sorgente.
- Se l'email e gia attiva nella stessa property HA, l'utente e considerato gia attivo.
- Se l'email appartiene a un altro tenant HotelAccelerator, l'attivazione e bloccata; non viene spostata automaticamente.

## Operatori ManuBot senza email reale

Un operatore creato da WhatsApp o Telegram puo esistere legittimamente in ManuBot con un indirizzo tecnico interno del tipo `bot+wa_...@manubot.it` o `bot+tg_...@manubot.it`. Quell'indirizzo identifica l'account tecnico ManuBot ma **non e una email valida da usare come login HotelAccelerator**.

La directory mostra comunque la persona, senza esporre l'indirizzo tecnico come recapito utilizzabile, e presenta `Inserisci email` al posto di `Attiva`.

Quando il tenant admin inserisce l'email reale:

1. il Core rilegge server-side la directory e verifica che l'utente appartenga davvero alla property attiva;
2. verifica che l'email reale non appartenga a un altro tenant HotelAccelerator;
3. invia l'email a un endpoint ManuBot dedicato e autenticato server-to-server;
4. ManuBot consente la sostituzione soltanto se il profilo ha membership attiva nello stesso tenant, e solo se l'email corrente e un placeholder bot;
5. ManuBot aggiorna Auth e profilo e respinge collisioni con altre identita;
6. HotelAccelerator rilegge la directory e pretende di vedere la nuova email reale prima di procedere;
7. solo a quel punto viene eseguito il normale provisioning HotelAccelerator.

Il browser non puo trasformare autonomamente un indirizzo sorgente, scegliere un tenant ManuBot o forzare il provisioning con un placeholder.

## Attivazione

Per un utente con email reale il browser invia esclusivamente `product` ed `externalUserId`. Per un operatore ManuBot con placeholder invia anche l'email reale inserita dall'amministratore. Il Core non si fida di nessuno dei dati identita ricevuti dal browser: rilegge sempre il satellite prima del provisioning.

Il Core:

1. ricava di nuovo il tenant satellite dal `customer_account` della property attiva;
2. rilegge la directory del satellite e trova l'utente per ID locale;
3. per un placeholder ManuBot esegue il flusso di sostituzione e verifica descritto sopra;
4. usa email e nome riletti server-to-server;
5. crea/riusa la `suite_identity` nello stesso customer account;
6. collega l'identita locale del satellite;
7. crea o riusa l'utente HotelAccelerator;
8. collega l'identita HA.

Un utente importato viene creato in HA sempre come **Editor**, `is_tenant_admin=false`, con `can_manage_users=false` e `can_delete=false`. I privilegi del prodotto sorgente non vengono ereditati. Il tenant admin assegna successivamente gruppi e permessi HotelAccelerator.

L'operazione e idempotente: ripetere `Attiva` per una persona gia presente non crea duplicati.

## Disponibilita parziale

La directory usa richieste indipendenti ai prodotti. Se un satellite non risponde, la pagina non fallisce nel suo insieme: segnala il prodotto temporaneamente non aggiornabile e mostra comunque gli utenti provenienti dagli altri prodotti.

## Sicurezza

- GET e POST Core richiedono `requireTenantAdmin` (o SuperAdmin con tenant selezionato).
- Nessun service role viene inviato al browser.
- Gli endpoint satellite sono dedicati alle chiamate Core e non riusano endpoint UI generici.
- ManuBot parte da `company_memberships` attive, non dal solo `profiles.company_id`, per rispettare utenti multi-company.
- Un placeholder ManuBot e bloccato anche lato backend Core, non soltanto nella UI.
- L'aggiornamento email ManuBot richiede autenticazione S2S, membership attiva, profilo attivo, account `bot_only` e assenza di collisioni.
- Santaddeo parte da `hotel_users` e richiede profilo attivo nella organization dell'hotel.
- HotelProfitAI parte da `user_company_memberships` della company richiesta.

## Rollback

Il rollout non modifica lo schema dati HotelAccelerator e non intercetta flussi login esistenti. Per rollback operativo si puo rimuovere/nascondere la sezione directory dal Core.

Per gli operatori ManuBot con placeholder, in emergenza si puo disabilitare il PATCH di sostituzione e lasciare visibile la persona come non attivabile. Una email reale gia associata correttamente in ManuBot non va trasformata di nuovo in placeholder durante il rollback: e un dato identita valido, non uno stato temporaneo della UI.
