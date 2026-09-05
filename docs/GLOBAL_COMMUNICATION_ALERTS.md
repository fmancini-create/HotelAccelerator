# Avvisi globali nuove comunicazioni

## Obiettivo

Il primo deliverable del centro notifiche trasversale avvisa l'operatore quando arriva una nuova comunicazione mentre sta lavorando in qualunque pagina dell'area tenant.

Copertura iniziale:

- email, WhatsApp, Telegram e chat/sito quando l'ingestione crea un nuovo record inbound in `messages`;
- telefonate in entrata registrate in `phone_calls`;
- segnale visivo pulsante e cliccabile;
- segnale acustico distinto per messaggi e telefonate;
- deduplica client per evitare doppi avvisi dello stesso evento.

Questa estensione non promuove l'intero `Centro notifiche, audit trail e health connettori unificati`, che resta a livello ufficiale `Specifica` finche' audit, health, recovery, preferenze e collaudi multi-tenant non sono completati.

## Ownership degli eventi

Gli avvisi non introducono nuovi webhook, cron o processi di ingestione.

- Inbox/messaggistica continua a essere alimentata dai proprietari attuali dei singoli canali. Il componente globale ascolta soltanto gli `INSERT` della tabella `messages` gia' pubblicata tramite Supabase Realtime.
- 3CX e i flussi telefonici esistenti restano proprietari della scrittura di `phone_calls`. Il componente globale legge soltanto le nuove chiamate tramite una route HotelAccelerator.
- La PR delle chiamate da richiamare (`call-action-notifications`) resta separata: gestisce lo stato operativo durevole delle chiamate perse, mentre questo deliverable segnala l'arrivo di una nuova comunicazione.

## Isolamento tenant e permessi

### Messaggi

La subscription Realtime applica il filtro `property_id` del tenant attivo. La tabella `messages` mantiene le policy RLS tenant-scoped gia' esistenti. Vengono notificati esclusivamente record con `sender_type = customer`, quindi risposte dell'operatore e messaggi di sistema non generano il segnale.

### Telefonate

`phone_calls` non viene esposta direttamente a Realtime e non vengono ampliate le policy RLS browser. La route `/api/platform/communication-alerts/phone`:

1. verifica l'area `calls` lato server;
2. deriva `property_id` dalla sessione autenticata;
3. filtra `direction = inbound`;
4. restituisce soltanto le righe successive al cursore temporale del client;
5. limita la finestra di recupero e il numero di righe per richiesta.

Un membro senza permesso Telefonate riceve `403`; il client interrompe poi il polling telefonico per quella sessione.

## Segnale acustico

Il suono e' generato con Web Audio API e non richiede file audio o servizi esterni. I browser moderni bloccano l'audio automatico prima di una interazione dell'utente: il componente sblocca l'audio al primo click/tocco/tasto della sessione. Prima di quel gesto l'avviso visivo resta comunque disponibile.

## Segnale visivo

L'avviso e' montato una sola volta nel layout tenant e quindi resta disponibile su dashboard, Inbox, CRM, tracking e altre pagine amministrative. Mostra:

- icona del tipo di comunicazione;
- titolo e dettaglio sintetico;
- indicatore luminoso pulsante;
- contatore quando piu' eventi arrivano durante lo stesso avviso;
- CTA `Apri` verso Inbox o Telefonate;
- `aria-live=assertive` per tecnologie assistive.

Il layout e' responsive e usa una larghezza compatibile con smartphone.

## Recovery e degrado

- Realtime messaggi: l'assenza temporanea del canale non modifica o duplica i dati; l'Inbox mantiene i propri meccanismi di sync/poll gia' esistenti.
- Feed telefonico: un errore temporaneo viene ritentato al ciclo successivo senza mostrare errori tecnici all'operatore.
- Il cursore telefonico e' limitato a una finestra recente per evitare query storiche accidentali.
- Gli ID gia' notificati vengono mantenuti in una cache client limitata.

## Verifiche richieste prima della produzione

- `pnpm run typecheck`;
- `pnpm vitest run tests/global-communication-alerts.test.ts`;
- lint sui file modificati;
- build Next.js della preview;
- test reale con una comunicazione Inbox inbound;
- test reale con una telefonata inbound;
- verifica che un messaggio outbound non notifichi;
- verifica con un membro senza area Telefonate;
- verifica cambio tenant senza ricevere eventi del tenant precedente;
- verifica desktop e smartphone;
- verifica del suono dopo la prima interazione utente.

## Rollback

Il deliverable non richiede migrazioni database. Il rollback consiste nella rimozione di `GlobalCommunicationAlerts` dal layout tenant e della route telefonica; nessun dato operativo viene modificato.
