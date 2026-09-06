# HotelAccelerator — Regole operative per agenti AI

Queste regole valgono per ogni modifica al repository. Il codice esistente e' la fonte tecnica primaria sullo stato attuale.

## Contesto umano

Il prodotto e' guidato da un founder non tecnico che lavora con assistenti AI e v0. Le conversazioni devono quindi restare semplici, concrete e comprensibili.

- Non chiedere al founder di scegliere tra dettagli tecnici equivalenti se la decisione puo' essere presa in sicurezza dall'agente.
- Tradurre sempre una richiesta di prodotto in requisiti, impatti, implementazione e verifica.
- Spiegare rischi e scelte in linguaggio comune prima dei termini specialistici.
- Preferire pochi passi verificabili a grandi riscritture.
- Se due soluzioni soddisfano lo stesso bisogno, preferire quella piu' semplice da mantenere e osservare nel lungo periodo.

## Metodo obbligatorio

Prima di modificare codice:

1. leggere `AGENTS.md`, `PROJECT_OVERVIEW.md`, `ARCHITECTURE.md`, `MODULE_REGISTRY.md`, `DECISIONS.md`, `INTEGRATIONS.md`, `ROADMAP.md` e la documentazione pertinente;
2. individuare app, package condivisi, schema dati, migrazioni, API, cron, webhook, variabili ambiente e deploy interessati;
3. verificare nel codice cio' che esiste realmente;
4. separare fatti verificati, ipotesi e proposta;
5. descrivere brevemente scope e file interessati;
6. implementare la soluzione minima completa senza refactor estranei;
7. eseguire lint, typecheck, test e build pertinenti;
8. verificare tenant isolation, autorizzazioni, errori, loading, empty state, mobile e accessibilita';
9. aggiornare documentazione e stato del modulo quando cambia l'evidenza.

## Regola fondamentale — ogni sviluppo vive nella Roadmap SuperAdmin

La pagina `/super-admin/roadmap` e' la memoria operativa del prodotto per il founder e deve essere aggiornata **in parallelo allo sviluppo**, non a posteriori.

- Ogni nuova funzionalita, nuovo modulo, integrazione, addon o sviluppo dedicato deve avere una riga nella roadmap.
- Quando il founder chiede di **avviare una PR/branch dedicata a uno sviluppo**, l'agente deve nello stesso flusso creare la riga se non esiste oppure aggiornare quella esistente.
- La riga deve contenere almeno: area, capability chiara in linguaggio prodotto, stato lavoro, branch e PR quando disponibile, livello tecnico ufficiale ed evidenza/limite residuo.
- All'apertura del lavoro usare `In sviluppo`; se non ancora iniziato usare `Da fare`; se dipende da un ostacolo esterno usare `Bloccato`; se si decide di non proseguire usare `Abbandonato` senza cancellare la riga.
- **Mai segnare verde/Online una funzione solo perche' esiste codice su un branch o una preview.**
- Una riga diventa verde/`Online` esclusivamente dopo: merge in `main`, CI pertinente verde, deploy di produzione verificato e aggiornamento esplicito della roadmap.
- Il verde indica che quello specifico sviluppo e' arrivato in produzione; **non** promuove automaticamente il livello tecnico a `Tenant reale`, `Multi-tenant`, `Production-ready` o `Vendibile`.
- Se una PR viene chiusa senza merge o il lavoro viene sospeso definitivamente, la roadmap va aggiornata a `Abbandonato` o `Bloccato` prima di chiudere il lavoro.
- Se una funzione gia' esistente riceve un'estensione sostanziale, aggiornare la riga esistente quando rappresenta la stessa capability; creare una nuova riga quando serve ricordare separatamente un deliverable ancora da terminare.
- Un'attivita' di puro bugfix/refactor/manutenzione che non introduce o avvia una capability di prodotto puo' essere dichiarata `Roadmap: N/A` nella PR; non creare rumore con righe inutili.
- Prima di dichiarare una PR di sviluppo conclusa, verificare sempre che la relativa riga roadmap esista e rappresenti lo stato reale.

Questa regola e' parte della Definition of Done e non e' opzionale.

## Regola fondamentale — addon contestuali, mai funzioni morte

Quando una funzione sarebbe concretamente piu' utile grazie a un addon della suite, lo stato dell'addon deve essere visibile **nel punto in cui nasce il bisogno**.

- Se l'addon e' attivo, mostrare l'azione operativa reale e non una promozione.
- Se l'addon e' inattivo, non limitarsi a nascondere il bottone o mostrare un errore tecnico: spiegare in una frase il vantaggio specifico in quel contesto e offrire una CTA chiara di attivazione/acquisto.
- La proposta deve essere contestuale e sobria, non un banner pubblicitario generico ripetuto ovunque.
- Se entitlement/configurazione non sono leggibili o sono incoerenti, **non** dichiarare l'addon inattivo e non spingere un acquisto: mostrare invece uno stato tecnico non disponibile/configurazione da completare.
- Lo stato commerciale/tecnico deriva dalle fonti autorevoli del Core (`suite_product_entitlements`, `tenant_modules` e link di suite); il browser e i satelliti non lo inventano.
- La CTA non deve promettere attivazione self-service immediata se il checkout/provisioning non la supporta ancora.
- Esempi vincolanti: Recensioni -> ManuBot per trasformare criticita' in ticket; Inbox -> ManuBot per trasformare una conversazione/risposta in attivita' operativa; costi/documenti -> HotelProfitAI quando pertinente; revenue/pricing -> Santaddeo quando pertinente.
- Le integrazioni tra prodotti passano da API/SDK versionati del Core, non da accessi diretti ai database degli altri prodotti.

Questa regola vale come criterio di Definition of Done per ogni superficie che usa o puo' valorizzare un addon.

## Stati ufficiali

Usare solo questi livelli:

`Idea` · `Specifica` · `UI/mock` · `Codice` · `Demo` · `Tenant reale` · `Multi-tenant` · `Production-ready` · `Vendibile`

Non usare "sviluppato", "completo" o "funzionante" senza indicare livello ed evidenza.

## Principi architetturali

- Suite multi-tenant con isolamento rigoroso dei dati.
- Login unico e accesso a moduli per tenant, ruolo ed entitlement.
- HotelAccelerator Core possiede identita', tenant context e servizi trasversali.
- Santaddeo, HotelProfitAI e ManuBot restano domini autonomi integrabili tramite API/eventi versionati.
- Nessun accesso diretto fragile fra database.
- Un solo proprietario per ogni cron, webhook o automazione.
- Operazioni critiche idempotenti, tracciate, ritentabili e osservabili.
- Segreti solo in sistemi sicuri e variabili ambiente.
- Autorizzazione server-side, RLS come difesa aggiuntiva, audit trail e minimo privilegio.
- Migrazioni additive per default; cambi rischiosi richiedono rollback.
- Preferire estensione e riuso a duplicazione o riscrittura.

## Scalabilita'

Progettare per migliaia di strutture senza costruire in anticipo complessita' inutile.

- I flussi sincroni devono restare brevi; lavori pesanti vanno su job/code asincrone quando necessario.
- Ogni query tenant-owned deve essere indicizzabile e filtrata per tenant.
- Evitare scansioni globali, polling aggressivo e fan-out non controllato.
- Introdurre cache solo con chiavi tenant-aware e invalidazione definita.
- Feature flag e rollout graduale per funzioni costose o rischiose.
- Prima di introdurre una dipendenza centrale, definire limiti, fallback e comportamento in degrado.

## AI e automazioni

L'AI assiste, ma non puo' mascherare l'assenza di logica reale.

- Un solo orchestratore o contratto condiviso per capacita' AI trasversali quando possibile.
- Context, knowledge e policy devono essere separati dal provider AI.
- Human-in-the-loop per azioni economiche, reputazionali, commerciali o operative ad alto impatto finche' non esiste evidenza sufficiente per automatizzarle.
- Ogni passaggio AI-operatore deve preservare il contesto, senza far ripetere il problema all'ospite.

## Valore prodotto

Prima di ampliare lo scope, verificare che una funzione migliori almeno uno di questi punti:

1. tempo risparmiato allo staff;
2. ricavo o costo evitato per l'hotel;
3. esperienza dell'ospite;
4. affidabilita' o controllo operativo.

Se non migliora nessuno dei quattro, resta fuori priorita'.

## Definition of Done

Una funzione e' conclusa solo quando requisiti, UI, backend, dati, autorizzazioni, errori, audit, test, monitoraggio, documentazione, migrazione e rollback applicabili sono trattati insieme.

Per qualunque sviluppo di prodotto, la Definition of Done include inoltre la roadmap: la riga deve esistere dall'avvio e diventare `Online` soltanto dopo merge in `main` e deploy produzione verificato.

## CTA commerciale delle home

- Nelle home pubbliche la CTA per richiesta commerciale deve essere **“Prenota una demo”** e aprire il calendario di prenotazione; non usare form contatti, link mail o diciture “Parla con un consulente/team”.

## REGOLA FERREA — un solo script 4BID per sito, tutte le funzioni da remoto

Questa e' un'invariante architetturale della suite ed e' **BUILD/REVIEW BLOCKER**. Una PR che la viola non deve essere mergiata, anche se la singola funzione sembra funzionare.

1. **Installazione una volta sola.** Se sul sito del cliente esiste gia' almeno uno script pubblico compatibile di una piattaforma 4BID, e' vietato chiedere di installare un secondo snippet per attivare chat, tracking, messaggi promo, recensioni o future capability web.
2. **Ogni script 4BID e' un ingresso della suite.** Gli entrypoint pubblici storici devono delegare al `4BID Suite Loader`/bootstrap condiviso oppure essere da esso orchestrati. Nuovi entrypoint standalone che bypassano il loader sono vietati salvo impossibilita' tecnica documentata.
3. **Accensione e spegnimento sono server-side.** Il browser riceve un manifest/configurazione risolto dal server in base a tenant, entitlement, configurazione, dominio/origin e stato reale dei servizi. Il browser non inventa entitlement, tenant o feature flag commerciali.
4. **Nuova capability = manifest + loader, non nuovo snippet.** Qualunque nuova funzione destinata al sito del cliente deve estendere il manifest e il runtime condiviso. Creare uno script separato per comodita' locale e' una regressione architetturale.
5. **Tracking unico.** Santaddeo Analytics Intelligence e' il proprietario canonico del tracking comportamentale web della suite. Non devono esistere due motori che generano pageview, sessioni, engagement o attribuzione paralleli. HotelAccelerator puo' ricevere eventi custom/identity CRM, ma deve cucirli alla stessa sessione canonica e non creare un secondo flusso di pageview.
6. **Compatibilita' retroattiva obbligatoria.** URL, attributi e snippet gia' installati presso clienti devono restare funzionanti. Una nuova funzione non puo' richiedere la sostituzione manuale del codice gia' presente sul sito.
7. **Deduplica obbligatoria.** Se sullo stesso sito convivono piu' script storici 4BID, per ogni tenant/token/capability deve avviarsi una sola istanza runtime. Vietati doppie pageview, doppie impression, doppi listener, doppie patch di `fetch`/`sendBeacon`, doppi widget o doppie sessioni.
8. **Tenant e origin si risolvono sul server.** Un `property_id`/tenant ricevuto liberamente dal browser non e' mai autorevole. Il tenant va risolto da chiavi pubbliche, token, write key e mapping di suite controllati server-side; dominio/origin deve essere verificato secondo allowlist/configurazione.
9. **Failure isolation.** Un errore del loader, di Santaddeo, della chat o di una singola capability non deve rompere il sito del cliente ne' impedire alle altre capability sane di funzionare. I loader pubblici degradano in sicurezza e non lanciano errori bloccanti sull'host.
10. **Un solo proprietario per capability.** Il motore di una funzione vive in un solo prodotto autorevole. Le altre piattaforme possono esporre una UI locale di configurazione e chiamare API versionate del proprietario, ma non devono clonare logica, dati o job per "averli anche qui".
11. **Nessun accesso cross-DB per il bootstrap.** Risoluzione tenant, entitlement, configurazione e azioni cross-prodotto passano da contratti/API versionati e auditabili; niente letture dirette del database di un altro prodotto come scorciatoia.
12. **Test minimi obbligatori.** Ogni modifica al loader o a una capability web deve provare: almeno un entrypoint storico; attivazione/disattivazione remota senza modifica HTML; deduplica con piu' script presenti; tenant isolation; rifiuto di origin non ammesso; assenza di doppio tracking; fallback se un provider e' indisponibile.
13. **Non estendere un'architettura sbagliata.** Se una capability esistente viola queste regole, prima di aggiungerle nuove funzioni va ricondotta al loader unico oppure la PR deve dichiarare esplicitamente il blocco/debito tecnico e non presentarla come soluzione definitiva.

Ownership attuale: HotelAccelerator Core orchestra manifest/entitlement/tenant context e il runtime di suite; Santaddeo resta la fonte unica per Analytics Intelligence. Questa separazione non puo' essere invertita implicitamente da una feature locale.
