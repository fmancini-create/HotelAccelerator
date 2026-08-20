# 3CX Voice AI ↔ HotelAccelerator

Stato al 2026-08-20: **Codice** nel Core; collegamento e prova sul PBX ancora da eseguire.

## Scopo

Ogni tenant puo' creare i propri agenti telefonici: ciascun agente e' collegato a una base di conoscenza dello stesso
tenant. La lista non usa prodotti o basi predefiniti: Villa I Barronci, 4BID e ogni altro cliente vedono solo le
proprie basi. Il collegamento CRM telefonico generico resta disponibile per ciascun tenant.

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

1. L'amministratore crea o sceglie una base nel tenant corrente.
2. La pagina Telefono genera un collegamento univoco per quella base.
3. Una base senza fonti non viene usata.

Nessuna nuova tabella o colonna è richiesta.

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

## Configurazione operativa

1. In HotelAccelerator aprire **Canali → Telefono IP**.
2. In **Agenti telefonici AI** premere **Genera gli agenti dalle basi di conoscenza**.
3. Tutte le righe devono risultare `Pronto`; altrimenti aggiungere fonti alla rispettiva base.
4. In 3CX installare da **Integrazioni → Script di chiamata → Aggiungi dallo store** lo script OpenAI Voice Agent
   previsto dalla versione del PBX.
5. Creare in 3CX un route point per ogni agente desiderato e configurare nel custom tool l'URL mostrato da
   HotelAccelerator.
6. Collegare i tasti dell'IVR agli interni/route point corrispondenti.
7. Impostare 200 come `FallbackDestination`.
8. Provare una domanda presente e una assente da ogni base. La seconda deve trasferire al 200.

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

### Codice cliente

La verifica del codice cliente **non è implementata**: nello schema attuale dei contatti non esiste un campo
autorevole `customer_code`. Inventare una verifica o riusare un campo diverso collegherebbe persone sbagliate.
Prima di aggiungerla servono proprietario del dato, formato, sorgente e regole di privacy; solo dopo si potrà
versionare un contratto di verifica.

## File di evidenza

- `app/api/telephony/3cx/voice/v1/query/route.ts`
- `lib/telephony/voice-agent.ts`
- `lib/telephony/voice-products.ts`
- `lib/telephony/voice-response.ts`
- `app/api/telephony/3cx/inbound-urls/route.ts`
- `app/admin/channels/phone/page.tsx`
- `lib/telephony/__tests__/voice-*.test.ts`
