# HotelAccelerator Voice

Stato ufficiale: `Idea`

Ultimo aggiornamento: 2026-09-01

## Obiettivo

Valutare in futuro un addon telefonico nativo di HotelAccelerator che permetta al tenant di gestire voce, interni, code, routing, AI, registrazioni, trascrizioni e integrazione CRM/InBox senza dover esporre al cliente il provider telefonico sottostante.

## Principio architetturale

Non costruire da zero un PBX completo in stile 3CX. La direzione ipotizzata e' un livello HotelAccelerator proprietario sopra infrastruttura SIP/CPaaS o PBX specializzata, collegata tramite adapter sostituibili e contratti versionati.

Possibili modalita' future:

- Solo AI: HotelAccelerator Voice davanti al centralino esistente del cliente.
- Ibrido: AI, routing e CRM gestiti da HotelAccelerator con PBX del cliente a valle.
- Full Voice: numeri, interni, code, WebRTC/softphone, registrazioni, trascrizioni e AI gestiti come addon HotelAccelerator, mantenendo il carrier/provider intercambiabile.

## Vincoli

- Multi-tenant e isolamento rigoroso dei dati.
- Nessun accesso diretto fragile tra database.
- Provider telefonici astratti tramite adapter.
- Registrazioni, trascrizioni e consensi soggetti a policy privacy/retention configurabili.
- Operazioni critiche idempotenti, auditate e ritentabili.
- Nessun riferimento al provider infrastrutturale nell'esperienza tenant salvo necessità contrattuale o normativa.

## Priorita'

Non e' in sviluppo. La priorita' corrente resta rendere affidabile il flusso esistente 3CX + OpenAI Realtime + HotelAccelerator, incluso routing tenant-aware, fallback, trascrizioni e registrazioni.

Qualunque passaggio da `Idea` a `Specifica` richiedera' una decisione esplicita su provider, costi/minuto, numerazione, portabilita', sicurezza VoIP, compliance, SLA e piano di migrazione dai centralini esistenti.
