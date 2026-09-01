# 3CX condiviso fra tenant: routing del registro chiamate

Ultimo aggiornamento: 2026-09-01

## Stato

`Codice` fino a collaudo reale completo. Non promuovere a `Tenant reale` finche' una chiamata al numero 4BID non compare nel tenant 4BID e una chiamata a Villa I Barronci non resta nel tenant Villa I Barronci.

## Perche' esiste

Il caso e' eccezionale: Villa I Barronci e 4BID condividono oggi la stessa istanza 3CX, pur essendo tenant distinti in HotelAccelerator.

3CX consente una sola integrazione CRM server-side per PBX e il suo scenario `ReportCall` non espone il DID chiamato. Di conseguenza HotelAccelerator non puo' decidere il tenant dal numero di destinazione.

## Decisione

Il comportamento normale resta invariato: il template CRM autentica un solo tenant e il `ReportCall` viene registrato in quel tenant.

Solo un tenant esplicitamente configurato come utilizzatore dello stesso PBX puo' deviare il journal. La relazione e' salvata in `telephony_integrations.shared_pbx_journal_property_id`.

Il percorso preferito e' il route hint del voice agent. Quando un endpoint vocale autenticato del tenant condiviso riceve una richiesta:

1. normalizza il numero chiamante usando `phoneMatchKey`;
2. salva/aggiorna un hint backend-only con tenant sorgente, tenant target e orario;
3. se il percorso bot non produce `ReportCall`, crea una `phone_calls` tenant-scoped e ne aggiorna la trascrizione live usando `history + question + speech`;
4. se 3CX invia successivamente `ReportCall`, il journal accetta il cambio tenant solo se l'hint cade nell'intervallo temporale della stessa chiamata e la relazione di PBX condiviso e' ancora valida;
5. se esiste gia' la chiamata creata dal bridge vocale, il journal arricchisce la stessa riga con trascrizione provider, riepilogo, registrazione e sentiment invece di creare un doppione.

### Fallback deterministico per destinazione interna

Se il voice agent fallisce prima di creare un route hint e 3CX trasferisce la chiamata a una coda/interno, il `ReportCall` continua a non fornire il DID. In questo solo caso il journal puo' usare la destinazione interna come fallback, ma esclusivamente se:

- il target dichiara esplicitamente di condividere il PBX tramite `shared_pbx_journal_property_id`;
- la destinazione e' dichiarata in `telephony_extension_labels` di quel tenant;
- una sola struttura condivisa rivendica quell'interno.

Con zero o piu' corrispondenze il journal resta sul tenant PBX autenticato. Non vengono usate euristiche basate su nome, contatto o numero del chiamante.

Configurazione corrente verificata: la coda `820` (`4BID Operatore`) e' dichiarata nel tenant 4BID. Questo consente di attribuire correttamente a 4BID le chiamate del suo voice agent che cadono sul fallback 820.

## Compatibilita' payload caller 3CX

Il nome canonico del contratto HotelAccelerator resta `caller_number`. Per compatibilita' con call script 3CX precedenti, il percorso prospect accetta anche `caller`, `caller_id` e `ani`, normalizzandoli server-side prima del matching. Nessuno di questi campi puo' scegliere il tenant: il tenant continua a derivare esclusivamente dalla credenziale vocale autenticata.

Se nessun identificatore chiamante utilizzabile e' presente, il routing shared-PBX via voice hint resta fail-closed. Il fallback per destinazione interna puo' intervenire soltanto al `ReportCall` e con una destinazione dichiarata univocamente come sopra.

## Trascrizioni e registrazioni

`phone_calls` contiene `transcription`, `transcription_summary`, `recording_url`, `sentiment` e `transcription_updated_at`.

Il journal salva questi campi soltanto quando 3CX li include realmente nel `ReportCall`. `SupportsTranscription=true` nel template CRM dichiara la capacita' ma non dimostra che 3CX stia producendo o inviando trascrizione/audio per ogni chiamata.

Per le conversazioni gestite dal voice agent, HotelAccelerator puo' costruire una trascrizione propria da `history + question + speech` soltanto se lo script 3CX invia anche un identificatore del chiamante sufficiente a creare il route hint. Senza `caller_number` (o alias supportato) la cattura tenant-scoped non puo' essere collegata in modo sicuro.

## Dati e sicurezza

`telephony_call_route_hints` e' backend-only, ha RLS attiva e nessun grant per `anon` o `authenticated`. Conserva soltanto le ultime cifre normalizzate necessarie al matching, non il testo della conversazione e non segreti.

Il testo della conversazione vive esclusivamente in `phone_calls.transcription`, gia' protetta dal perimetro tenant del modulo telefonate.

La credenziale CRM e la credenziale vocale restano distinte. Il routing non accetta un `property_id` deciso dal browser o dal modello: il target deriva dalla credenziale voce oppure da una relazione PBX + destinazione interna dichiarata server-side.

## Caso configurato

- target condiviso: property `slug=4bid`, `type=company`;
- proprietario del journal CRM condiviso: property `slug=villa-i-barronci`, `type=hotel`;
- fallback operatore 4BID: interno/coda `820`, dichiarato nel tenant 4BID.

## Idempotenza e retry

L'hint mantiene l'ID della eventuale `phone_calls` sintetica. Un retry dello stesso `ReportCall` continua a risolvere allo stesso tenant attraverso la finestra temporale della chiamata anche dopo `consumed_at`.

Le chiamate successive dello stesso numero non ereditano automaticamente il vecchio routing: `last_seen_at` deve essere successivo all'inizio della nuova chiamata.

## Evidenza produzione 01/09/2026

Verifica database prima del fix:

- Villa I Barronci: 657 `phone_calls`;
- 4BID: 0 `phone_calls`;
- trascrizioni presenti su Barronci: 0;
- registrazioni con URL presenti su Barronci: 3;
- chiamate con destinazione 820 presenti nel journal Barronci: 4.

Questa evidenza dimostra che il problema osservato non e' soltanto di UI: i record sono stati persistiti sotto il tenant PBX sorgente. Il mapping `820 -> 4BID` e il fallback applicativo correggono le nuove chiamate; lo storico non viene spostato automaticamente prima del collaudo reale.

## Rollback

Rollback applicativo: ripristinare il journal alla versione precedente. Il PBX continua a funzionare e il tenant del template CRM torna a essere l'unica destinazione del journal.

Rollback configurazione: rimuovere l'etichetta 820 dal tenant 4BID oppure azzerare `shared_pbx_journal_property_id`.

Le righe `phone_calls` gia' create non vanno cancellate o spostate automaticamente.

## Collaudo reale richiesto

- chiamare il numero 4BID e verificare che una chiamata trasferita al fallback 820 compaia sotto 4BID;
- quando il voice agent torna operativo, verificare che lo script invii il numero chiamante e che la conversazione bot venga creata direttamente sotto 4BID;
- verificare trascrizione e `recording_url` separatamente: devono essere presenti soltanto se il relativo dato arriva realmente da 3CX o dal bridge vocale;
- chiamare Villa I Barronci senza passare dal bot 4BID: la chiamata deve restare sotto Villa I Barronci;
- ripetere il test dallo stesso cellulare in sequenza per escludere leakage fra chiamate.

## Evidenza codice

- `supabase/migrations/20260831214500_add_3cx_shared_pbx_routing.sql`
- `lib/telephony/shared-pbx-routing.ts`
- `lib/telephony/voice-request.ts`
- `app/api/telephony/3cx/journal/route.ts`
- `app/api/telephony/3cx/voice/v1/query/route.ts`
- `app/api/telephony/3cx/voice/v1/prospect/route.ts`
- `app/api/telephony/3cx/voice/v1/support/route.ts`
