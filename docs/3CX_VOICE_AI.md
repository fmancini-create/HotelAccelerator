# 3CX Voice AI ↔ HotelAccelerator

Stato al 2026-08-24: **Codice** nel Core; configurazione e prova sul PBX ancora da eseguire.

## Scopo

Ogni tenant puo' creare i propri agenti telefonici, ciascuno collegato a una propria base di conoscenza. Il
collegamento CRM telefonico generico resta disponibile per ciascun tenant.

Il primo menu del centralino separa due percorsi:

| Tasto | Percorso | Base interrogata | Escalation |
|---:|---|---|---|
| 1 | Assistenza tecnica clienti | Codice cliente → tenant → base del prodotto | Operatore, reperibile o messaggio |
| 2 | Informazioni per non clienti | Solo base commerciale 4 BID del prodotto | Operatore commerciale |
| 0 | Operatore | — | Interno/ring group 3CX |

Il secondo menu seleziona il prodotto: 1 Hotel Accelerator, 2 Santaddeo RMS, 3 Hotel Profit AI, 4 ManuBot. Il
fallback resta l'interno 200.

Il tenant decide nel proprio 3CX quali tasti, route point o numeri assegnare agli agenti. HotelAccelerator genera un
URL per ciascuna base di conoscenza; il fallback corrente e' l'interno 200.

## Responsabilità

- **3CX** possiede chiamata, audio, riconoscimento vocale, sintesi vocale e trasferimento.
- **HotelAccelerator Core** possiede tenant, selezione della base, retrieval, risposta fondata e soglia di confidenza.
- Il modello non sceglie liberamente la base: ogni route point usa un URL con l'identificativo della base scelto dal
  tenant, verificato lato server.
- Una risposta non fondata, una richiesta di operatore o un errore impongono il trasferimento al 200.

Questa separazione segue il modello documentato da 3CX per gli
[agenti vocali OpenAI](https://www.3cx.com/docs/open-ai-voice-agent/) e mantiene il Core come unica autorità sul
tenant e sulle basi di conoscenza.

## Associazione delle basi

La selezione avviene solo dentro le basi già filtrate per `property_id`.

1. L'amministratore crea o sceglie una base nel tenant corrente; la pagina Telefono genera un collegamento univoco.
2. Per gli agenti del centralino 4 BID, la descrizione della base usa il marker del prodotto: `[voice:hotel-accelerator]`, `[voice:santaddeo-rms]`, `[voice:hotel-profit-ai]` o `[voice:manubot]`. In assenza del marker è accettato solo un alias esatto.
3. Zero, più di una o nessuna fonte portano al fallback: il sistema non indovina per sottostringa.

Il contratto di assistenza usa il registro centrale dei codici cliente e la politica fuori orario della struttura.

## Endpoint v1

`POST /api/telephony/3cx/voice/v1/query`

Parametri query:

- `property`: tenant;
- `knowledge_base`: identificativo della base scelta dal tenant.

Intestazione obbligatoria:

- `X-HotelAccelerator-Key`: segreto in ingresso già mostrato come **Chiave di collegamento**. Il segreto non viene
  inserito nell'URL, così non finisce nei normali log di accesso.

Corpo JSON:

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

Risposta essenziale:

```json
{
  "ok": true,
  "speech": "Risposta breve da pronunciare.",
  "grounded": true,
  "confidence": 0.84,
  "transfer": {
    "required": false,
    "destination": "200",
    "reason": "none"
  }
}
```

Lo script 3CX deve pronunciare `speech` e, quando `transfer.required` è `true`, trasferire a
`transfer.destination`. Anche una risposta HTTP 429/502 contiene il blocco `transfer`, ma lo script deve mantenere
un proprio fallback al 200 se la chiamata HTTP non produce JSON.

### Prospect

`POST /api/telephony/3cx/voice/v1/prospect?property=<4bid>&product=<chiave>` usa esclusivamente la base commerciale
del tenant aziendale 4 BID. Non richiede né legge un codice cliente.

### Supporto clienti

`POST /api/telephony/3cx/voice/v1/support?property=<4bid>&product=<chiave>` richiede un codice cliente:

```json
{
  "customer_code": "3493840",
  "question": "Come riconnetto Gmail?",
  "after_hours": false,
  "history": []
}
```

Il codice identifica il tenant e il retrieval riparte dalla sua base del prodotto. La risposta include sempre
`customer.recognized` e `handoff.action`: `none`, `transfer` oppure `record_message`. Con quest'ultima azione 3CX
registra il messaggio invece di trasferire.

### Callback messaggio fuori orario

`POST /api/telephony/3cx/voice/v1/support/message?property=<4bid>&product=<chiave>` riceve `customer_code`,
`call_id`, `recording_reference` o `transcript` e `caller_number` facoltativo. `call_id` rende i retry idempotenti.
Il Core apre un'attività ad alta priorità nella coda centrale 4 BID, con il tenant cliente nei metadati.

## Configurazione operativa

1. In HotelAccelerator aprire **Canali → Telefono IP**.
2. In **Agenti telefonici AI** premere **Genera gli agenti dalle basi di conoscenza**.
3. Tutte le righe devono risultare `Pronto`; altrimenti aggiungere fonti alla rispettiva base.
4. In 3CX installare da **Integrazioni → Script di chiamata → Aggiungi dallo store** lo script OpenAI Voice Agent
   previsto dalla versione del PBX.
5. Per un tenant normale, creare un route point per ogni agente desiderato e configurare l'URL mostrato da HotelAccelerator.
6. Per l'IVR 4 BID, raccogliere il codice cliente nel percorso supporto e creare i quattro route point supporto e prospect; collegare il menu prodotto alle rispettive URL.
7. Per il supporto rispettare `handoff.action` e inviare la callback dopo una registrazione; impostare 200 come fallback locale.
8. Provare domanda presente/assente per un agente tenant e, sull'IVR 4 BID, codice valido/errato, escalation in orario, reperibilità enterprise e messaggio fuori orario.

La versione dello script distribuito dallo store 3CX può cambiare. Il codice del custom tool va aggiunto alla copia
effettivamente installata sul PBX, non ricostruito a memoria contro un'API potenzialmente diversa.

## Sicurezza e limiti

- Autenticazione a tempo costante con il segreto 3CX già cifrato a riposo.
- Segreto trasmesso nell'intestazione `X-HotelAccelerator-Key`, non nell'URL vocale.
- Tenant ricavato dal segreto e riapplicato alle query delle basi e dei contatti.
- Limiti di lunghezza su domanda e storia; massimo otto turni.
- Salvaguardia locale di 90 richieste/minuto per tenant; in produzione va affiancata da un limite distribuito/WAF.
- Risposte `no-store`; testo e token non vengono inseriti nei log applicativi.
- Il riconoscimento del chiamante riusa localmente l'anagrafica telefonica
  esistente. Al provider AI viene passato soltanto il valore cliente
  riconosciuto/non riconosciuto: nome, email e numero non lasciano il Core.

### Codice cliente e orario

Il Core assegna un numero cliente unico nella suite e lo stampa con il prefisso del prodotto: `HA-3493840`,
`SNT-3493840`, `HPA-3493840` oppure `MB-3493840`. Il cliente vede il formato completo nella piattaforma; al
centralino sceglie prima il prodotto e digita le sette cifre. Il prefisso ricevuto e' controllato rispetto al
prodotto scelto. È un identificatore di tenant, **non una password**: modifiche sensibili richiedono sempre una
verifica ulteriore dell'identità.

La property aziendale `4bid` è l'unica autorizzata a consultare la directory centrale. Un centralino configurato da
un singolo tenant non può quindi risolvere codici altrui. Fuori orario, 3CX invia `after_hours`: il piano `enterprise`
va al reperibile, gli altri alla registrazione, salvo una deroga `on_call`/`voicemail` salvata sul tenant.

## File di evidenza

- `app/api/telephony/3cx/voice/v1/query/route.ts`
- `app/api/telephony/3cx/voice/v1/prospect/route.ts`
- `app/api/telephony/3cx/voice/v1/support/route.ts`
- `app/api/telephony/3cx/voice/v1/support/message/route.ts`
- `lib/telephony/voice-agent.ts`
- `lib/telephony/customer-code.ts`
- `lib/telephony/voice-support.ts`
- `lib/telephony/voice-support-customer.ts`
- `lib/telephony/voice-products.ts`
- `lib/telephony/voice-response.ts`
- `app/api/telephony/3cx/inbound-urls/route.ts`
- `app/admin/channels/phone/page.tsx`
- `lib/telephony/__tests__/voice-*.test.ts`
- `supabase/migrations/20260824153000_add_universal_customer_code_and_voice_support_policy.sql`
- `supabase/migrations/20260824172000_add_prefixed_suite_customer_code_registry.sql`
- `supabase/migrations/20260824173500_deny_direct_client_access_to_customer_code_registry.sql`
- `supabase/migrations/20260824174000_preallocate_suite_product_customer_codes.sql`
- `docs/CUSTOMER_CODE_REGISTRY.md`
