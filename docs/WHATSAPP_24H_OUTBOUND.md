# WhatsApp outbound e finestra 24h

Ultimo aggiornamento: 2026-08-31

## Obiettivo

HotelAccelerator deve impedire che un operatore, una UI o una route interna invii un messaggio WhatsApp free-form quando la customer-care window del singolo cliente è chiusa.

La finestra viene calcolata sulla conversazione del cliente, non su `messaging_channels.last_inbound_at`: il numero business è condiviso da più ospiti e l'ultimo messaggio di un ospite non deve aprire la finestra di un altro.

## Template standard

Nome tecnico atteso di default:

`hotelaccelerator_nuova_comunicazione`

Lingua attesa di default:

`it`

Testo previsto:

`{{1}} ha una nuova comunicazione per te. Vuoi riceverla qui su WhatsApp?`

`{{1}}` è il nome della property/azienda tenant-scoped.

Pulsanti quick reply, nell'ordine:

1. `Apri comunicazione`
2. `Non ora`

I label sono configurati nel template Meta. HotelAccelerator passa payload opachi per collegare il click alla richiesta corretta senza affidarsi al testo visibile del pulsante.

È possibile sovrascrivere nome e lingua per uno specifico `messaging_channels.config` con:

- `reopen_template_name`
- `reopen_template_language`

Non inserire token o segreti in questi campi.

## Flusso

### Finestra aperta

1. L'operatore apre `Nuovo messaggio` nella Inbox.
2. Seleziona WhatsApp, cerca/seleziona il contatto o inserisce il numero con prefisso internazionale.
3. Il backend crea o riusa la conversazione WhatsApp corretta per tenant e numero business.
4. `lib/whatsapp/window.ts` cerca l'ultimo messaggio `sender_type = customer` della conversazione.
5. Se sono trascorse meno di 24 ore, il messaggio parte con `sendWhatsAppText` e viene persistito nella timeline.

### Finestra chiusa

1. Il testo dell'operatore viene salvato in `whatsapp_pending_messages` prima di contattare Meta.
2. Parte il template approvato con `{{1}} = properties.name`.
3. La UI mostra `Comunicazione in attesa`.
4. Se il cliente preme `Non ora`, la richiesta passa a `declined` e il testo non viene inviato.
5. Se il cliente preme `Apri comunicazione`, il webhook registra prima il messaggio inbound; questo apre la customer-care window.
6. Il webhook reclama la richiesta con stato `sending`, invia il testo sospeso e poi la marca `sent`.
7. Il messaggio viene inserito nella timeline con `source = whatsapp_reopen_queue`.
8. I quick reply di controllo non vengono passati all'autopilot AI.

## Idempotenza e retry

La coda usa gli stati:

- `awaiting_acceptance`
- `sending`
- `sent`
- `declined`
- `failed_template`
- `failed_delivery`
- `expired`

Esiste al massimo una richiesta attiva per conversazione negli stati `awaiting_acceptance`, `sending`, `failed_delivery`.

Il webhook processa il payload di riapertura anche quando il messaggio inbound è un retry già presente nella Inbox. In caso di `failed_delivery`, il retry Meta può ritentare la consegna. Una richiesta già `sent` non viene inviata nuovamente.

Dopo una risposta positiva da Meta, lo stato esterno `sent_message_id` viene registrato prima dell'inserimento nella timeline: in caso di errore DB successivo si preferisce un record locale da riparare a un doppio messaggio al cliente.

## Sicurezza e tenant isolation

- `whatsapp_pending_messages` ha RLS abilitata e policy basata su `auth_property_id()` / `auth_is_super_admin()`.
- `anon` non ha accesso alla tabella.
- Tutti gli endpoint verificano l'operatore e ricavano `propertyId` lato server.
- Il contatto passato dalla UI viene riletto con `property_id` prima dell'uso.
- Il quick-reply viene accettato solo se `pending.property_id`, `messaging_channel_id` e numero mittente coincidono.
- Nessun segreto WhatsApp viene esposto al browser.
- I forward WhatsApp verso un numero arbitrario non riusano la finestra della conversazione sorgente: devono passare dal composer omnicanale.

## UI

La Inbox espone un solo ingresso visibile `Nuovo messaggio` con due canali:

- Email: usa il compose Gmail esistente.
- WhatsApp: usa `/api/inbox/compose/whatsapp` e applica la protezione 24h.

Il vecchio pulsante `Scrivi` email-only è ritirato a livello route-scoped per evitare due significati diversi di “nuovo messaggio”.

La UI è responsive (`DialogContent` con limite `92dvh`, launcher accessibile da smartphone).

## Endpoint

- `GET /api/inbox/compose/contacts?q=...`: ricerca minima di nome/email/telefono nel tenant dell'operatore, senza richiedere il modulo CRM completo.
- `POST /api/inbox/compose/whatsapp`: crea o riusa contatto/conversazione e decide invio immediato vs template.
- `POST /api/channels/whatsapp/webhook`: oltre all'inbound standard gestisce i quick reply di riapertura.

## Migrazione

`supabase/migrations/20260831162757_add_whatsapp_pending_messages.sql`

Migrazione additiva già applicata al progetto Supabase HotelAccelerator il 2026-08-31.

## Rollback

Rollback applicativo sicuro:

1. ripristinare le route/client/UI precedenti;
2. lasciare la tabella `whatsapp_pending_messages` presente ma inutilizzata, così nessun dato/audit viene perso;
3. non rimuovere la tabella finché esistono richieste in `awaiting_acceptance`, `sending` o `failed_delivery`.

La rimozione fisica della tabella è distruttiva e richiede una decisione separata.

## Stato ufficiale

- Composer omnicanale Email/WhatsApp: `Codice` finché non viene collaudato su preview/tenant reale.
- Enforcement server-side finestra 24h: `Codice`.
- Template di riapertura: `Specifica` finché il template non è creato e approvato nel WABA interessato.
- Flusso end-to-end fuori 24h: non promuovere oltre `Codice` senza prova reale del template approvato e click cliente.
