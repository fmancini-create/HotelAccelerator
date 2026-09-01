# 3CX Voice AI ↔ HotelAccelerator

Stato al 2026-09-01: **Codice** nel Core; configurazione 4BID aggiornata al fallback operatore 820, collaudo PBX reale ancora richiesto.

## Scopo

Ogni tenant puo' creare i propri agenti telefonici, ciascuno collegato a una propria base di conoscenza. Il
collegamento CRM telefonico generico resta disponibile per ciascun tenant.

Il primo menu del centralino 4BID separa due percorsi:

| Tasto | Percorso | Base interrogata | Escalation |
|---:|---|---|---|
| 1 | Assistenza tecnica clienti | Codice cliente → tenant → base del prodotto | Operatore, reperibile o messaggio |
| 2 | Informazioni per non clienti | Solo base commerciale 4BID del prodotto | Operatore commerciale |
| 0 | Operatore | — | Coda 820 (`4BID Operatore`) |

Il secondo menu seleziona il prodotto: 1 Hotel Accelerator, 2 Santaddeo RMS, 3 Hotel Profit AI, 4 ManuBot. Il
fallback del solo hub 4BID e' la coda 820. Gli agenti vocali dei tenant normali restano indipendenti e mantengono il
proprio fallback configurato (default applicativo storico: 200).

La combinazione dei due menu produce otto percorsi persistenti (`1.1`–`1.4` e `2.1`–`2.4`). Un superadmin li
configura in **Canali → Telefono IP**, dopo avere selezionato esplicitamente il tenant aziendale `4bid`. Ogni riga
mostra intento, nome agente, scope delle basi, tool CRM, politica di fallback e stato diagnostico.

## Responsabilità

- **3CX** possiede chiamata, audio, riconoscimento vocale, sintesi vocale e trasferimento.
- **HotelAccelerator Core** possiede tenant, selezione della base, retrieval, risposta fondata e soglia di confidenza.
- Il modello non sceglie liberamente la base: ogni route point usa un URL con l'identificativo della base scelto dal
  tenant, verificato lato server.
- Per l'hub 4BID una risposta non fondata, una richiesta di operatore o un errore deve usare la destinazione persistente
  della route, oggi 820.

Questa separazione segue il modello documentato da 3CX per gli agenti vocali OpenAI e mantiene il Core come unica
autorita' sul tenant e sulle basi di conoscenza.

## Endpoint v1

`POST /api/telephony/3cx/voice/v1/query`

Parametri query:

- `property`: tenant;
- `knowledge_base`: identificativo della base scelta dal tenant.

Intestazione obbligatoria:

- `X-HotelAccelerator-Key`: credenziale vocale dedicata, distinta dalla chiave del template CRM.

Corpo JSON minimo:

```json
{
  "question": "Come funziona il vostro sistema?",
  "caller_number": "+393351234567",
  "history": [
    { "role": "user", "content": "Buongiorno" },
    { "role": "assistant", "content": "Buongiorno, come posso aiutarla?" }
  ]
}
```

Per il PBX condiviso 4BID/Barronci `caller_number` e' essenziale: consente al Core di creare il route hint e di
persistire la conversazione del bot nel tenant 4BID. Il percorso prospect accetta anche gli alias legacy `caller`,
`caller_id` e `ani`, ma il contratto canonico resta `caller_number`.

### Prospect

`POST /api/telephony/3cx/voice/v1/prospect?property=<4bid>&product=<chiave>` usa esclusivamente la base commerciale
del tenant aziendale 4BID. Non richiede ne' legge un codice cliente.

### Supporto clienti

`POST /api/telephony/3cx/voice/v1/support?property=<4bid>&product=<chiave>` richiede un codice cliente e usa la
`fallback_destination` persistente della route 4BID. Le otto route 4BID sono configurate a 820.

## Trascrizioni e registrazioni

`phone_calls` contiene `transcription`, `transcription_summary`, `recording_url`, `sentiment` e
`transcription_updated_at`.

- Le conversazioni gestite dal voice agent possono essere persistite dal Core tramite `history + question + speech`
  quando il call script invia anche il numero chiamante.
- Il journal salva audio/trascrizione provider soltanto quando 3CX li include realmente nel `ReportCall`.
- `SupportsTranscription=true` nel template CRM dichiara una capacita', ma non dimostra che 3CX produca o invii il dato
  per ogni chiamata.

## Configurazione 4BID verificata

- tenant hub: `4bid`;
- property ID: `fe0e6052-f1b8-4752-9ade-812ceed90635`;
- PBX condiviso con Villa I Barronci;
- coda operatore: `820` (`4BID Operatore`);
- route persistenti `1.1`–`1.4` e `2.1`–`2.4`: fallback 820.

## Sicurezza

- Segreto voce nell'header, mai nell'URL o nel repository.
- Tenant ricavato dal segreto e riapplicato server-side.
- Routing shared-PBX fail-closed: nessun `property_id` scelto dal browser o dal modello.
- Le chiamate tenant-owned restano filtrate per `property_id`.

## Collaudo richiesto

1. chiamare 0558290741;
2. verificare che un fallback alla coda 820 compaia solo nel tenant 4BID;
3. con voice agent operativo, verificare che lo script invii il numero chiamante e che `transcription` venga valorizzata;
4. verificare `recording_url` separatamente, solo se 3CX lo invia;
5. chiamare Villa I Barronci e verificare che la chiamata resti nel tenant Barronci;
6. ripetere dal medesimo cellulare per escludere leakage tra tenant.

## File di evidenza

- `lib/telephony/voice-products.ts`
- `lib/telephony/shared-pbx-routing.ts`
- `lib/telephony/voice-request.ts`
- `app/api/telephony/3cx/voice/v1/query/route.ts`
- `app/api/telephony/3cx/voice/v1/prospect/route.ts`
- `app/api/telephony/3cx/voice/v1/support/route.ts`
- `app/api/telephony/3cx/journal/route.ts`
- `app/api/telephony/3cx/inbound-urls/route.ts`
- `supabase/migrations/20260901195500_set_4bid_voice_fallback_820.sql`
- `docs/3CX_SHARED_PBX_ROUTING.md`

## Rollback

- applicativo: ripristinare il branch/commit precedente;
- dati: riportare esplicitamente le otto `voice_ivr_routes` 4BID alla destinazione precedente solo se il PBX viene
  riconfigurato di conseguenza;
- nessuna riga `phone_calls` viene spostata o cancellata automaticamente.
