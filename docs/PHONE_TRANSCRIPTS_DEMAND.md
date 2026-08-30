# Trascrizioni telefoniche e calendario domanda

Ultimo aggiornamento: 2026-08-30

## Obiettivo

Per i tenant hotel, una telefonata trascritta deve essere trattata come una conversazione testuale ai fini dell'intelligence sulla domanda: il contenuto passa allo stesso estrattore IA configurato per il gruppo di lavoro e le richieste rilevate alimentano il calendario della domanda.

## Stato verificato prima della correzione

- `phone_calls` possiede gia' `transcription`, `transcription_summary`, `recording_url`, `sentiment` e `transcription_updated_at`.
- Il template CRM 3CX dichiara `SupportsTranscription=true` e inoltra trascrizione, riepilogo, registrazione e sentiment al journal HotelAccelerator quando 3CX li rende disponibili.
- Il registro Telefonate leggeva solo metadati e quindi non mostrava le trascrizioni esistenti.
- Il motore domanda salvava ogni telefonata come `kind=chiamata`, `method=metadati`, `contenuto=non_disponibile` e non analizzava `phone_calls.transcription`.
- Il calendario domanda sapeva aggregare il volume telefonico, ma non una richiesta estratta dal parlato.

## Implementazione

Branch: `fix/phone-transcripts-demand-20260830`.

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

## Isolamento tenant e sicurezza

- nessun nuovo segreto;
- nessun dato voce esposto senza autorizzazione area `calls`;
- query telefoniche filtrate per `property_id` autenticato;
- estrazioni e calendario continuano a usare le tabelle con RLS gia' previste dal modulo domanda;
- nessun nuovo cron: il proprietario resta `/api/cron/demand-extract`.

## Livello funzione

`Codice` sul branch indicato. Non promuovere a `Tenant reale` o superiore finche' non sono verificati build/typecheck, preview e una chiamata reale 3CX con trascrizione che genera una richiesta nel calendario del tenant corretto.

## Collaudo richiesto

1. Verificare che una chiamata reale registrata da 3CX abbia `phone_calls.transcription` valorizzato.
2. Aprire `/admin/calls` e verificare riepilogo/trascrizione sul tenant corretto.
3. Eseguire il cron domanda o attendere la sua esecuzione programmata.
4. Verificare una sola `conversation_extractions` per `phone_call_id + group_id + config_version`, con `method=modello`.
5. Verificare nel calendario domanda una richiesta sulla data soggiorno/servizio pronunciata nella telefonata e il volume telefonico sul giorno effettivo della chiamata.
6. Ripetere il cron e verificare assenza di nuovi costi/doppioni per la stessa telefonata/configurazione.
