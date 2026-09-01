# Evidenza 3CX: trascrizioni e registrazioni — 01/09/2026

## Stato

`Codice`, non ancora `Tenant reale` per trascrizioni/audio.

## Evidenza database produzione

Per il PBX condiviso Villa I Barronci / 4BID, prima della correzione di isolamento tenant:

- 657 chiamate risultavano sotto Villa I Barronci;
- 0 chiamate risultavano sotto 4BID;
- 0 chiamate avevano `transcription` valorizzata;
- 3 chiamate avevano `recording_url` valorizzata.

Quindi il problema segnalato non e' soltanto di presentazione: 3CX non sta fornendo al journal una trascrizione per le chiamate osservate, e il link registrazione e' disponibile soltanto per una parte minima delle chiamate.

## Contratto applicativo

Il template CRM dichiara `SupportsTranscription=true` e il journal accetta `transcription`, `summary`, `recording_url` e `sentiment`. Questo e' un contratto di ingresso, non prova che 3CX generi o invii quei campi.

Per il voice agent, HotelAccelerator puo' produrre una trascrizione propria dalla conversazione con il Core, ma per il PBX condiviso deve ricevere anche `caller_number` (o un alias supportato) per creare il route hint tenant-scoped. Senza questo identificatore la cattura non viene persistita per evitare leakage fra tenant.

## Criterio di collaudo

1. una nuova chiamata 4BID deve essere persistita sotto 4BID;
2. una conversazione gestita dal voice agent deve valorizzare `transcription` nel record 4BID;
3. una chiamata registrata da 3CX deve valorizzare `recording_url` quando 3CX lo espone al `ReportCall`;
4. nessun dato voce deve migrare fra 4BID e Villa I Barronci.
