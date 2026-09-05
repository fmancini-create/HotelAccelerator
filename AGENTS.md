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

## Fiscalita' 4BID — regola vincolante

- **HotelProfitAI e' l'unico fiscal owner della suite 4BID.**
- Flusso canonico: `prodotto 4BID -> HotelProfitAI -> FattureInCloud -> invio SDI manuale in FattureInCloud -> HotelProfitAI`.
- HotelAccelerator puo' gestire incasso, Stripe, entitlement e riferimenti economici, ma non deve essere proprietario della creazione delle fatture FattureInCloud ne' dell'invio SDI ordinario.
- Ogni pagamento fatturabile deve essere attribuibile deterministicamente al progetto/tenant e idempotente; con Stripe preservare la Stripe Invoice e `metadata.project` canonico.
- I segreti FattureInCloud appartengono all'hub HotelProfitAI dopo il cutover.
- Il codice FattureInCloud locale oggi presente in HotelAccelerator e' **legacy in conflitto**: non estenderlo e non considerarlo il target. Rimuoverlo/neutralizzarlo solo con cutover controllato, verifica end-to-end e rollback per evitare fatture perse o duplicate.
- Dopo l'invio manuale allo SDI, HotelProfitAI deve riconciliare e aggiornare lo stesso documento con stato/esito; il satellite non crea una seconda fonte fiscale.
- Leggere `docs/4BID_FISCAL_HUB.md` prima di modificare billing, Stripe, webhook fiscali o integrazioni FattureInCloud.

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
