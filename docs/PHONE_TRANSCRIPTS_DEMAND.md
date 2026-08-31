# Trascrizioni telefoniche e calendario domanda

Ultimo aggiornamento: 2026-08-31

## Obiettivo

Per i tenant hotel, una telefonata trascritta deve essere trattata come una conversazione testuale ai fini dell'intelligence sulla domanda: il contenuto passa allo stesso estrattore IA configurato per il gruppo di lavoro e le richieste rilevate alimentano il calendario della domanda.

## Stato verificato prima della correzione

- `phone_calls` possiede gia' `transcription`, `transcription_summary`, `recording_url`, `sentiment` e `transcription_updated_at`.
- Il template CRM 3CX dichiara `SupportsTranscription=true` e inoltra trascrizione, riepilogo, registrazione e sentiment al journal HotelAccelerator quando 3CX li rende disponibili.
- Il registro Telefonate leggeva solo metadati e quindi non mostrava le trascrizioni esistenti.
- Il motore domanda salvava ogni telefonata come `kind=chiamata`, `method=metadati`, `contenuto=non_disponibile` e non analizzava `phone_calls.transcription`.
- Il calendario domanda sapeva aggregare il volume telefonico, ma non una richiesta estratta dal parlato.

## Implementazione

Branch originario: `fix/phone-transcripts-demand-20260830`.

### UI e API

`/api/telephony/calls` restituisce i campi voce solo dopo `requireAreaApi("calls")` e dopo aver risolto il `propertyId` autenticato. Tutte le query restano filtrate per `property_id`.

`/admin/calls` mostra:

- riepilogo IA, quando disponibile;
- trascrizione espandibile;
- sentiment del provider;
- link alla registrazione, quando fornito da 3CX.

Il layout resta responsive: i dettagli voce sono dentro la singola riga della telefonata e non richiedono una tabella orizzontale.

### Estrazione IA

`lib/demand/scope.ts` legge anche la trascrizione delle `phone_calls` tenant-scoped.

`lib/demand/run.ts` riusa `extractWithModel()` di `lib/demand/extract.ts`, cioe' lo stesso estrattore configurabile usato per il testo libero delle conversazioni. Non viene creato un secondo orchestratore IA.

Se la trascrizione non e' ancora disponibile, la riga di estrazione resta un placeholder `method=metadati`; non viene considerata definitivamente elaborata. Quando 3CX aggiorna `phone_calls.transcription`, una passata successiva puo' promuovere la stessa riga a `method=modello` senza creare doppioni.

Il claim `claim_demand_extraction` viene usato anche con `p_target_type=phone_call`, evitando doppie chiamate concorrenti al modello.

### Calendario domanda

La riga telefonica mantiene `reference_date` uguale al giorno della chiamata per non alterare i KPI `chiamate` e `chiamate_perse`.

L'esito IA viene salvato nello stesso envelope sotto `payload.richiesta`, con una `reference_date` separata corrispondente alla data dell'evento/soggiorno richiesta dal cliente.

`lib/demand/aggregate.ts` usa quindi:

- giorno chiamata -> metriche `chiamate` / `chiamate_perse`;
- data richiesta -> `richieste`, `ospiti`, `coperti`, esiti e breakdown `canale:phone`.

Questo evita sia il doppio conteggio sia lo spostamento artificiale del volume chiamate sulla data di soggiorno.

## Configurazione CRM 3CX verificata il 31/08/2026

Il test reale su Villa I Barronci ha confermato che 3CX genera la trascrizione, mentre il vecchio template non eseguiva correttamente il `ReportCall` verso HotelAccelerator.

Correzioni applicate nel branch `fix/3cx-reportcall-transcription-20260831`:

- template portato a `Version="3"`;
- mantenuto `SupportsTranscription="true"`;
- rimossi `Variables` e `Outputs` dallo scenario riservato `ReportCall`;
- mantenuti `Transcription`, `Summary`, `RecordingUrl` e `Sentiment` nel payload JSON;
- il pulsante `Prepara collegamento CRM` non dipende piu' dallo stato della Call Control API 3CX.

La **Chiave di collegamento HotelAccelerator** e' distinta dalla API key Call Control di 3CX. Si recupera da **Canali -> Telefono IP -> Collegamento CRM -> Prepara collegamento CRM**. L'endpoint riusa la chiave CRM gia' esistente invece di rigenerarla, cosi' il caricamento di un nuovo template non invalida la configurazione precedente.

Dopo il caricamento del template v3 in 3CX:

1. incollare la Chiave di collegamento HotelAccelerator;
2. lasciare `Registra le chiamate nel CRM = True`;
3. verificare che le trascrizioni siano abilitate sui reparti/utenti/flussi 3CX interessati;
4. fare una chiamata reale;
5. verificare `POST /api/telephony/3cx/journal` e i campi voce nel tenant corretto.

## PBX 3CX condiviso 4BID / Villa I Barronci

Il test reale sul numero 4BID ha mostrato un secondo caso: il bridge vocale `/api/telephony/3cx/voice/v1/prospect` riceve la conversazione e risponde `200`, ma il percorso solo-bot non produce necessariamente un `ReportCall` CRM.

Inoltre 3CX ha una sola integrazione CRM server-side per PBX e il `ReportCall` non espone il DID chiamato. Per questo il tenant non viene mai indovinato dal numero di destinazione.

Il branch `fix/3cx-shared-pbx-journal-routing` introduce un'eccezione esplicita e isolata:

- il caso normale non cambia;
- un tenant puo' dichiarare `shared_pbx_journal_property_id` solo per un PBX 3CX condiviso;
- un endpoint voice autenticato lascia un hint temporale backend-only per il chiamante;
- se il percorso bot non produce `ReportCall`, la conversazione `history + question + speech` viene salvata direttamente in una sola `phone_calls` del tenant voice;
- se il `ReportCall` arriva successivamente, il journal verifica mapping, chiamante e intervallo temporale, quindi arricchisce la stessa riga con i dati provider invece di duplicarla;
- senza mapping/hint valido il journal resta sul tenant autenticato dal template CRM.

Dettaglio architetturale e rollback: `docs/3CX_SHARED_PBX_ROUTING.md`.

Questa cattura diretta alimenta lo stesso campo `phone_calls.transcription`, quindi non crea un secondo motore domanda: il cron esistente continua a trattarla come una normale telefonata trascritta.

## Isolamento tenant e sicurezza

- nessun segreto nuovo esposto al client;
- nessun dato voce esposto senza autorizzazione area `calls`;
- query telefoniche filtrate per il `property_id` risolto e verificato lato server;
- il routing shared-PBX richiede una relazione esplicita fra tenant e un hint creato da un endpoint voice autenticato;
- `telephony_call_route_hints` e' backend-only, RLS attiva, nessun grant per `anon`/`authenticated`;
- estrazioni e calendario continuano a usare le tabelle con RLS gia' previste dal modulo domanda;
- nessun nuovo cron: il proprietario resta `/api/cron/demand-extract`;
- la chiave CRM resta cifrata a riposo ed e' recuperabile solo attraverso l'azione amministrativa tenant-scoped prevista dall'applicazione.

## Livello funzione

`Codice`. Non promuovere a `Tenant reale` o superiore finche' non sono verificate chiamate reali sui due percorsi: 4BID deve restare in 4BID, Villa I Barronci deve restare in Villa I Barronci, e almeno una trascrizione deve alimentare correttamente l'estrazione domanda prevista dal tenant/gruppo abilitato.

## Collaudo richiesto

1. Verificare che una chiamata reale registrata da 3CX abbia `phone_calls.transcription` valorizzato oppure, per il percorso solo-bot shared-PBX, che la cattura live abbia creato la trascrizione nel tenant corretto.
2. Aprire `/admin/calls` e verificare riepilogo/trascrizione sul tenant corretto.
3. Nel caso shared-PBX, chiamare 4BID e poi Villa I Barronci dallo stesso cellulare e verificare assenza di leakage fra tenant.
4. Se 3CX invia `ReportCall` dopo la cattura live, verificare che non venga creata una seconda `phone_calls`.
5. Eseguire il cron domanda o attendere la sua esecuzione programmata.
6. Verificare una sola `conversation_extractions` per `phone_call_id + group_id + config_version`, con `method=modello` quando il gruppo include le telefonate.
7. Verificare nel calendario domanda una richiesta sulla data soggiorno/servizio pronunciata nella telefonata e il volume telefonico sul giorno effettivo della chiamata.
8. Ripetere il cron e verificare assenza di nuovi costi/doppioni per la stessa telefonata/configurazione.
