# Telefonia agnostica — provider, adapter e guide

Stato ufficiale della capability: **Codice** solo dopo merge + CI + deploy verificati. La presenza di una guida non promuove il relativo connettore a `Tenant reale`.

## Obiettivo

HotelAccelerator non deve dipendere da 3CX. Il Core possiede un contratto telefonico comune e ogni PBX implementa un adapter. Il tenant sceglie un solo provider attivo e vede una guida semplice con link ufficiali e, quando disponibili con URL stabile del vendor, schermate ufficiali.

Prima ondata di catalogo:

- 3CX;
- Wildix;
- NethVoice;
- VOIspeed UCloud;
- Yeastar P-Series;
- Microsoft Teams Phone;
- Cisco Webex Calling;
- Asterisk / FreePBX;
- Avaya IP Office.

Non e una classifica di quota di mercato. Sono provider diffusi o presenti nel mercato italiano e tecnicamente rilevanti per hotel e aziende.

## Contratto

`lib/telephony/providers.ts` e il registro UI/capability. `lib/telephony/adapters.ts` implementa soltanto operazioni documentate e realmente codificate.

Stato iniziale degli adapter:

| Provider | Verifica automatica | Click-to-call | Note |
|---|---:|---:|---|
| 3CX | si | si | adapter esistente preservato; funzioni Voice/CRM avanzate restano 3CX-specifiche |
| Wildix | si | no | Company API Key verificata; payload make-call da collaudare su PBX reale prima di abilitarlo |
| NethVoice | si | no | login NethCTI verificato; non viene richiesta l'API `unauthe_call` |
| VOIspeed | si | si | SERI `get_user_call_report` + `call_request` |
| Yeastar P-Series | si | si | OpenAPI `get_token`, `system/information`, `call/dial` |
| Asterisk/FreePBX | si | si | ARI `asterisk/info` e `channels` originate |
| Teams Phone | guida | no | richiede app Microsoft Entra/OAuth Graph da collaudare |
| Webex Calling | guida | no | richiede OAuth Webex e scope Calling da collaudare |
| Avaya IP Office | bridge | no | DevLink/TSPI richiede servizio persistente, non una Vercel Function |

`click-to-call` carica il provider attivo e passa dall'adapter. Non contiene piu una dipendenza diretta da 3CX.

## Dati

`telephony_integrations` continua a essere tenant-owned e conserva una riga per `(property_id, provider)`. La migration:

- allarga il CHECK `provider` ai provider registrati;
- aggiunge `provider_config jsonb` per opzioni non segrete specifiche del provider;
- impone con indice parziale un solo provider `is_active=true` per property;
- introduce `telephony_integration_audit`, backend-only;
- introduce una RPC service-role per switch/upsert atomico del provider attivo.

Segreti: sempre nelle colonne cifrate esistenti; `provider_config` non deve contenere password/token.

## Sicurezza rete

Le URL PBX vengono chiamate dal backend e sono quindi validate contro SSRF. La nuova API accetta soltanto HTTPS e rifiuta localhost, `.local`, `.internal` e IP privati/link-local.

Un PBX on-prem deve essere reso raggiungibile tramite un FQDN HTTPS protetto/allowlist o un bridge dedicato. Non si chiede mai al tenant di esporre una API anonima per comodita.

## Compatibilita 3CX

Le route `/api/telephony/3cx/*` restano disponibili. La pagina storica 3CX viene mantenuta sotto `/admin/channels/phone/3cx` come configurazione avanzata per lookup CRM, journal, shared PBX e Voice Agent.

## Guide

La pagina `/admin/channels/phone` mostra il catalogo, lo stato reale e `Guida alla configurazione` per ogni provider. I testi sono volutamente non tecnici. I link puntano a documentazione ufficiale. Le schermate remote vengono mostrate solo quando l'URL del vendor e stabile e verificato; non vengono inventate immagini dell'interfaccia.

## Gate di maturita

- 3CX conserva le evidenze esistenti.
- Nessun altro provider sale a `Tenant reale` senza credenziali/impianto reale e almeno: verifica connessione, chiamata test se supportata, isolamento tenant, failure/retry e prova del flusso inbound previsto.
- Teams/Webex/Avaya restano `Specifica`/guida per la parte runtime finche non viene collaudato OAuth/bridge.

## Rollback

Rollback applicativo: ripristinare la pagina 3CX come unica scelta e il dispatch click-to-call 3CX. I record degli altri provider possono restare inattivi. Non eliminare audit o segreti storici durante un rollback applicativo. La rimozione dell'indice/colonna/funzione richiede una migration esplicita separata.
