# 3CX shared PBX: fallback per destinazione interna

## Contesto

4BID e Villa I Barronci condividono eccezionalmente lo stesso PBX 3CX e lo stesso template CRM. Il `ReportCall` del template CRM non espone il DID chiamato, quindi il tenant effettivo non puo' essere dedotto dal numero pubblico.

Il percorso preferito resta il route hint creato dall'agente vocale autenticato. Quando quel percorso non e' disponibile (per esempio se l'agente vocale fallisce prima di interrogare HotelAccelerator e la chiamata cade su una coda), il journal puo' usare una destinazione interna solo se questa e' dichiarata in modo univoco nel tenant condiviso.

## Regola

- `telephony_integrations.shared_pbx_journal_property_id` dichiara quali tenant condividono il journal del PBX.
- `telephony_extension_labels` dichiara le destinazioni interne appartenenti al tenant condiviso.
- Il journal devia la chiamata dal tenant PBX autenticato soltanto se una singola struttura condivisa possiede quell'interno.
- In caso di zero o piu' corrispondenze resta sul tenant PBX autenticato: nessuna euristica per nome, contatto o numero del chiamante.

Configurazione corrente 4BID: la coda operatore `820` e' dichiarata nel tenant 4BID. Questo permette di attribuire a 4BID le chiamate che il suo voice agent manda al fallback 820 anche quando 3CX non fornisce il DID nel `ReportCall`.

## Trascrizioni e registrazioni

Il journal salva `transcription`, `summary`, `recording_url` e `sentiment` soltanto quando 3CX li include nel `ReportCall`. Il fatto che il template dichiari `SupportsTranscription=true` non dimostra che il PBX stia producendo o inviando quei campi per ogni chiamata.

Per le conversazioni gestite dal voice agent, HotelAccelerator puo' creare una trascrizione propria solo quando riceve anche un identificatore del chiamante sufficiente a creare il route hint. Se lo script 3CX non invia il numero chiamante al Core, la cattura tenant-scoped non puo' essere collegata in modo sicuro.

## Rollback

Rimuovere l'etichetta dell'interno dal tenant condiviso oppure rimuovere il mapping `shared_pbx_journal_property_id`. Le righe storiche in `phone_calls` non vengono spostate automaticamente.
