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
